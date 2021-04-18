const process = require('process');

const express = require('express');
const cors = require("cors");
const minio = require('minio')
const fileUpload = require('express-fileupload');
const v4 = require('uuid').v4;

const PORT = process.env.PORT ?? 3000;
const COSIPATH = process.env.MOUNT_PATH ?? "/data/cosi";

const MAXDATE = new Date(8640000000000000);

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

    const now = MAXDATE.valueOf() - Date.now()

    const object_key = `${now}:${id}:${image.name}`

    console.log(object_key);

    const response = await minioClient.putObject(config.bucketName, object_key, image.data);
    // const response = 'hi';
    res.send({ response });
});

app.post('/images', async (req, res) => {
    let lastItem = "";
    if (req.body.lastItem) {
        lastItem = req.body.lastItem;
    }

    const stream = minioClient.listObjectsV2(config.bucketName, "", false, lastItem);

    const PAGE_SIZE = 20;
    let current = 0;
    const rows = [];

    stream.on('data', (obj) => {
        if (current < PAGE_SIZE) {
            rows.push(obj);
        }
        current += 1;
        if (current == PAGE_SIZE) {
            stream.destroy();
        }
    });

    stream.on('error', () => {
        res.status(500).end();
    })

    stream.on('close', async () => {
        console.log(`finished reading ${rows.length} objects`);
        console.log(rows);
        if (rows.length === 0) {
            res.status(404).end();
            return
        }

        const promises = rows.map(async (row) => {
            return minioClient.presignedGetObject(
                config.bucketName,
                row.name,
                12 * 60 * 60,
            )
        });

        const images = await Promise.all(promises);
        
        const outData = {
            lastItem: rows[rows.length-1].name,
        }

        outData.images = images.map((v, i) => {
            const name = rows[i].name.split(':').slice(2).join('')

            return { name, image: v }
        });

        res.send(outData).end();
    });

});

app.get('*', (req, res) => {
    res.status(404);
});

app.listen(PORT, async () => {
    console.log(`Application started on ${PORT}`);
});
