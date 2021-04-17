const process = require('process');

const express = require('express');
const cors = require("cors");
const minio = require('minio')
const fileUpload = require('express-fileupload');
const v4 = require('uuid').v4;

const db = require('./db');

const PORT = process.env.PORT ?? 3000;
const COSIPATH = process.env.MOUNT_PATH ?? "/data/cosi";

const credsFile = require(COSIPATH + '/credentials.json')
const config = require(COSIPATH + '/protocolConn.json')

const creds = JSON.parse(credsFile.CredentialsFileContents)

console.log(creds);
console.log(config);

const app = express();

app.use(express.json());
app.use(fileUpload());
app.use(cors());

const minioClient = new minio.Client({
    endPoint: config.endpoint,
    port: 9000,
    useSSL: false,
    accessKey: creds.username,
    secretKey: creds.password,
});

app.get('/exists', (req, res) => {
    minioClient.bucketExists(config.bucketName, function (err, exists) {
        if (err) {
            res.send({ err });
        }
        if (exists) {
            res.send({ exists });
        }
    })
});

app.post('/upload', async (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).send('No files were uploaded.');
    }

    const image = req.files.image;

    const id = v4();

    const response = await minioClient.putObject(config.bucketName, id, image.data); 

    const query = {
        text: 'INSERT INTO images VALUES($1)',
        values: [id],
    }

    await db.pool.query(query);

    res.send({response});
});

app.post('/images', async (req, res) => {
    const page = req.body.page ?? 0; 
    console.log(req.body);
    const query = {
        text: `SELECT imageID, count(*) OVER() AS full_count
        FROM   images
        ORDER  BY created_at
        OFFSET $1
        LIMIT  $2`,
        values: [page*20, 20],
    }

    const data = await db.pool.query(query);

    if (data.rowCount == 0) {
        res.status(404).end();
        return;
    }

    const outData = {
        totalPages: Math.ceil(data.rows[0].full_count/20),
        currentPage: page,
    }

    const promises = data.rows.map(async (row) => {
        return minioClient.presignedGetObject(
            config.bucketName,
            row.imageid,
            12*60*60,
        )
    });

    const images = await Promise.all(promises);

    outData.images = images;

    res.send(outData).end();
});

app.get('*', (req, res) => {
    res.status(404);
});

app.listen(PORT, async () => {
    await db.init();
    console.log(`Application started on ${PORT}`);
});
