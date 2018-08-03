var express = require('express');
var router = express.Router();
var https = require('https');
var pg = require('pg');
const { Pool } = require('pg');
var listo=148;

const pRemoto= new Pool({
  host: '10.66.166.30',
  user: 'postgres',
  password: '',
  database: 'db_sac_pru',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
})

const pLocal = new Pool({
  host: '10.66.166.30',
  user: 'postgres',
  password: '',
  database: 'payvalida_simulacion',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
})

var fs = require('fs');
var path = require('path');
var certFile = path.resolve(__dirname, 'certificados/intercredito_com_co.crt');
var keyFile = path.resolve(__dirname, 'certificados/intercredito.key');

router.get('/consultaBaloto', function(req, res, next) {

  var stringQuery = "select id,cedula,enviar from pagos where enviar=1 and idtransaccion is null limit 5";
  var stringUpdate = "update pagos set listo="+listo+",enviar=0,idTransaccion=$1,monto=$3 where id=$2 ";
  var stringUpdateRemotoCuota = "update sac_log_baloto_consulta_response set res_monto=$1 where bal_id=$2";

  pLocal.query(stringQuery)
      .then((res) => {
          res.rows.forEach(function(row){
            //console.log(row.cedula);
            var postData = {"cedula":row.cedula};
            //enviar la cedula para consultar
            var postObject = constructPostDataConsulta(postData);

            https.request(postObject, function(error,response,body){
              console.log("se envio la consulta "+row.cedula);

              if (!error && response.statusCode == 200) {
                var info = JSON.parse(body);                //{"status":"OK","mensajeError":null,"monto":6047.0,"cedula":"1098555777","descripcion":"ARTURO AMEREAGLETESORO 599-1","idTransaccion":1039,"email":"pagosbaloto@gmail.com"}
                var montoMenos = Number(info.monto)-500;
                var paramsUpdate = [info.idTransaccion,row.id,montoMenos];
                var paramUpdateCuotaRemoto = [montoMenos,info.idTransaccion];
                pRemoto.query(stringUpdateRemotoCuota,paramUpdateCuotaRemoto)
                  .then((res)=>{
                    pLocal.query(stringUpdate,paramsUpdate)
                      .then((res)=>{
                        console.log("Se actualizo el registro "+row.id);
                        var dataPago = constructPostPago(info);
                        var postObjectPago = constructPostDataPago(dataPago);
                        console.log("---------------------------------------------------------");
                        console.log(dataPago);
                        console.log("---------------------------------------------------------");
                        console.log(postObjectPago);
                        console.log("---------------------------------------------------------");
                        https.request(postObjectPago, function(error,response,body){
                          console.log("se envio el pago");
                          if (!error && response.statusCode == 200) {


                          }else{
                            console.log("error enviando el pago");
                            console.log(error);
                          }
                        })
                      })
                      .catch((err)=>{
                          console.log(err)
                      })
                  })
                  .catch((err)=>{
                    console.log("No pudo actualizar cuota remota");
                  })


              }else{
                var paramsUpdate = ["-1",row.id];
                pLocal.query(stringUpdate,paramsUpdate)
                .then((res)=>{
                  console.log("Se actualizo el registro "+row.id);
                })
                .catch(err=>{
                  console.log("Error actualizando registro"+row.id);
                })
                console.log("ocurrio un error "+error);
              }
            });
          })
      })
      .catch(err => console.error('Error executing query', err.stack))
      res.send('respond with a resource');
});

router.get('/consultaUsuariosConCuotas',function(req,res,next){
  //pgClient.connect();
  var stringQuery = ["select cli.cli_nroid as cedula,cuo.cuo_valorcuota as monto,",
                    "puc.puc_nombre as descripcion ",
                    "from sac_cuota cuo",
                    "inner join sac_credito cred on",
                    "cuo.emp_empresa=cred.emp_empresa and",
                    "cuo.puc_puntocredito=cred.puc_puntocredito and",
                    "cuo.tpd_tipodoc=cred.tpd_tipodoc and",
                    "cuo.npd_secuencia=cred.npd_secuencia and",
                    "cuo.cre_numerodocument=cred.cre_numerocredito",
                    "inner join sac_cliente cli on",
                    "cred.cli_cliente = cli.cli_cliente",
                    "inner join sac_puntocredito puc on",
                    "puc.puc_puntocredito=cred.puc_puntocredito",
                    //"where cuo.cuo_estado='ACT' and cli.cli_nroid='87069371'"
                    "where cuo.cuo_estado='ACT' limit 4500"
                    ].join(' ');

  pRemoto.query(stringQuery)
      .then((res) => doInsert(res.rows)) // brianc
      .catch(err => console.error('Error executing query', err.stack))

  res.sendStatus(200);
});

router.get('/connectToPayValidaEmulator',function(req,res,next){
  var pagos=[];
  var stringQuery = ["select id,cedula,monto,descripcion,idtransaccion,email,enviar,listo from pagos where listo=",listo].join(' ');
  pLocal.query(stringQuery)
    .then(function(respuesta){
      respuesta.rows.forEach(function(ele){
        var montoMenos = Number(ele.monto)-500;
        var pago = {
              "idTransaccion": ele.idtransaccion,
              "amount": montoMenos,
              "id_cliente": ele.cedula,
              "pv_checksum": "checkbyemulator",
              "respuestaObtenida": "{\"status\":\"OK\",\"mensajeError\":null}",
              "po_id": "1152695344",
              "pv_payment": "baloto",
              "iso_currency": "COP",
              "fechaPago": "15/02/2018",
              "pv_po_id": "1152695344",
              "status": "APROBADA"
        };
        pagos.push(pago);
      });

      var resultadoFinal = {
        "CODIGO":"OK",
        "DATA":pagos,
        "RESULTADO":"Transaccion exitosa"
      };

      res.status(200).send(resultadoFinal);
    })
    .catch((err)=>console.log(err));
});

router.get('/montoMenos',function(req,res,next){
  var monto = "27593.00";
  var montoMenos = Number(monto)-100;
  var obj = {"montoMenos":montoMenos};
  res.status(200).send(obj);
});

router.get('/insertDatosPagosRequest',function(req,res,next){
  var pagos=[];
  var stringQuery = ["select id,cedula,monto,descripcion,idtransaccion,email,enviar,listo from pagos where listo=",listo].join(' ');
  pLocal.query(stringQuery)
    .then(function(respuesta){
      respuesta.rows.forEach(function(ele){
        var pv_po_id= 1152695344;
        var query1="INSERT INTO sac_log_baloto_pago_request (req_id,req_pv_po_id, req_po_id, req_status, req_amount, req_iso_currency, req_pv_payment, req_id_cliente, req_pv_checksum, req_fecha, req_idtransaccion, bal_id) VALUES ((SELECT NEXTVAL('sac_log_baloto_pago_request_seq')),$1,$2,'APROBADA',$3,'COP','baloto',$4,'111111','2017-12-21 11:40:03',$5,$6);"
        var query2="INSERT INTO sac_log_baloto_pago_response (res_id,res_status,res_mensaje_error, res_fecha, bal_id) VALUES((SELECT NEXTVAL('sac_log_baloto_pago_response_seq')),'ERROR','Pago no enviado por PayValida.','2017-12-21 11:40:03',$1);";
        var params1 = [pv_po_id,ele.idtransaccion,ele.monto,ele.cedula,ele.idtransaccion,ele.idtransaccion];
        var params2 = [ele.idtransaccion];

        pRemoto.query(query1,params1)
          .then(function(respuesta){
            pRemoto.query(query2,params2)
              .then(function(respuesta){
                console.log("INSERTS EFECTUADOS CORRECTAMENTE");
              })
              .catch((err)=>console.log(err));
          })
          .catch((err)=>console.log(err));
      });

      res.status(200).send("OK");
    })
    .catch((err)=>console.log(err));
});

var doInsert = function(rows){
    rows.forEach(function(row){
      var params = [row.cedula];
      var stringQuerySiEsta = "select count(*) as cuantos from pagos where cedula=$1";
      pLocal.query(stringQuerySiEsta,params)
        .then(res=>{
          //console.log(res.rows[0].cuantos);
          if(res.rows[0].cuantos==0){
            var stringQueryInsertInicio = "insert into pagos (cedula,monto,descripcion,email,enviar) values($1,$2,$3,$4,$5)";
            var enviar=1;
            var params = [row.cedula,row.monto,row.descripcion,'correo@payvalida.com',enviar];
            pLocal.query(stringQueryInsertInicio,params)
              .then((res)=>console.log(res))
              .catch((err)=>console.log(err));
          }
        })
        .catch((err)=>console.log(err));
    })
}

var constructPostDataConsulta = function(postData){

 var   options = {
       host: 'https://jbosscapa.intercredito.com.co:8446/sac-ext/rest/cuota/consulta',
       //uri: 'http://localhost:8080/sac-ext/rest/cuota/consulta',
       body: JSON.stringify(postData),
       method: 'POST',
       headers: {
            'Content-Type': 'application/json',
            'gsec-user-token': '283D5E7EDR3547RL4A8FXJ8002ZY971E9C1FADF015CB1003F09'
      },
      //agentOptions: {
        cert: fs.readFileSync(certFile),
        key: fs.readFileSync(keyFile),
        // Or use `pfx` property replacing `cert` and `key` when using private key, certificate and CA certs in PFX or PKCS12 format:
        // pfx: fs.readFileSync(pfxFilePath),
        //passphrase: 'password',
        //securityOptions: 'SSL_OP_NO_SSLv3'
      //}
    }
    return options;

}

var constructPostDataPago = function(postData){

 var   options = {
       //uri: 'http://localhost:8080/sac-ext/rest/cuota/registrarPago',
       host: 'https://jbosscapa.intercredito.com.co:8446/sac-ext/rest/cuota/registrarPago',
       body: JSON.stringify(postData),
       method: 'POST',
       headers: {
            'Content-Type': 'application/json',
            'gsec-user-token': '283D5E7EDR3547RL4A8FXJ8002ZY971E9C1FADF015CB1003F09'
      }
    }
    return options;

}

var constructPostPago = function(data){
  var montoMenos = Number(data.monto)-500;
  var postData = {
        "pv_po_id": 1152695344,
        "po_id": data.idTransaccion,
        "status": "aprobado",
        "amount": montoMenos,
        "iso_currency": "pesos",
        "pv_payment": "pv_payment",
        "id_cliente": data.cedula,
        "pv_checksum": "checkbyemulator",
        "idTransaccion": data.idTransaccion
  }
  return postData;
}

var respuestaMalos, respuestaDetalle;
//consulta para sacar el reporte de malos-999 > creditos bec-cir con fecha
router.get('/consultaMalosConFecha', function(req, res, next) {

  var consultaMalos = " WITH reporte_datacredito AS ( SELECT cli.cli_cliente, cli.cli_nombrecompleto, cli.cli_nroid, cli.ecl_estadocli, cre.emp_empresa, cre.puc_puntocredito, cre.tpd_tipodoc, cre.cre_estado, cre.npd_secuencia, cre.cre_numerocredito, extract(YEAR from cre.cre_fechafinancia) as cre_fechafinancia, dir.dir_nombre, dir.dir_email, dir.dir_celular, dir.dir_telefono, ci.ciu_ciudad, ci.ciu_nombre, dep.dep_nombre, cre.cre_saldo FROM sac_cliente AS cli INNER JOIN sac_credito AS cre ON cli.cli_cliente = cre.cli_cliente INNER" +
    " JOIN sac_direccion AS dir ON cli.dir_direccion = dir.dir_direccion INNER JOIN sac_barrio AS ba ON dir.bar_barrio = ba.bar_barrio INNER JOIN sac_ciudad AS ci ON ba.ciu_ciudad = ci.ciu_ciudad INNER JOIN sac_departamento AS dep ON ci.dep_departamento = dep.dep_departamento WHERE cli.ecl_estadocli IN ('BEC', 'CIR') AND cli.tpi_tipoid = 13 AND cre.cre_estado IN ('BEC', 'CIR') AND cre.tpd_tipodoc = 'CR' ) SELECT cli_cliente,cli_nombrecompleto, cli_nroid, ecl_estadocli, emp_empresa," + " puc_puntocredito,tpd_tipodoc, cre_estado, npd_secuencia, cre_numerocredito,cre_fechafinancia FROM reporte_datacredito GROUP BY cli_cliente,cli_nombrecompleto, cli_nroid, ecl_estadocli, emp_empresa, puc_puntocredito,tpd_tipodoc, cre_estado, npd_secuencia, cre_numerocredito, cre_fechafinancia ";

  var consultaDetalle = "SELECT * FROM sac_reporte_datacredito_detalle detalle INNER JOIN sac_cliente cliente ON detalle.datdet_numero_identificacion=cliente.cli_nroid WHERE datdet_estado_cuenta = '2' AND dat_id=19";

  pRemoto.query(consultaMalos)
    .then(function(respuesta) {
      respuestaMalos = respuesta;

      pRemoto.query(consultaDetalle)
        .then(function(respuesta_) {
          respuestaDetalle = respuesta_;

          var malosTotal=0;
          var malosDetalle=0;
          var promesas = [];

          respuestaMalos.rows.forEach(function(ele){
            //console.log("comparacion:"+ele.cli_nroid+"="+cedula);
            //var siEsta = comprobarSiEstaEnDetalle(ele.cli_nroid);
            promesa(respuestaDetalle,ele.cli_nroid);
            promesas.push(promesa);

          });

          Promise.all(promesas)
            .then(values=>{
              console.log(values);
            })


          /*var fs = require('fs');
          var file = fs.createWriteStream('array.txt');
          file.on('error', function(err) {console.log(err)});
          respuestaMalos.rows.forEach(function(ele){
            var linea = [ele.cli_nroid,ele.cli_nombrecompleto].join(",");
            file.write(linea + '\n');
          });
          file.end();

          var file = fs.createWriteStream('arrayDetalle.txt');
          file.on('error', function(err) {console.log(err)});
          respuestaDetalle.rows.forEach(function(ele){
            //console.log(ele);
            var linea = [ele.datdet_numero_identificacion].join(",");
            file.write(linea + '\n');
          });
          file.end();*/


          console.log("malosTotal"+malosTotal);
          console.log(malosDetalle);

        })
        .catch((err) => console.log(err));
      res.status(200).send("OK");
    })
    .catch((err) => console.log(err));
});

var promesa = function(datos,cedula){
  return new Promise((resolve,reject)=>{
    datos.rows.forEach(function(ele){
      //console.log("comparacion:"+ele.cli_nroid+"="+cedula);
      if(String(ele.datdet_numero_identificacion)==String(cedula)){
        resolve(444);
      }
    });
  })
}

var comprobarSiEstaEnDetalle = function(cedula) {
  respuestaDetalle.rows.forEach(function(ele){
    //console.log("comparacion:"+ele.cli_nroid+"="+cedula);
    if(String(ele.datdet_numero_identificacion)==String(cedula)){
      return true;
    }
  });
}

module.exports = router;
