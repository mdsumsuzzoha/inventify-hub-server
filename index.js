const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require('mongodb');

//middleware
app.use(cors())
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@pheroprojectdbcluster.qyoezfv.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const productCollection = client.db("inventifyHubDB").collection("products");
        const userCollection = client.db("inventifyHubDB").collection("users");
        const shopCollection = client.db("inventifyHubDB").collection("shops");

        // jwt related api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(
                user,
                process.env.ACCESS_TOKEN_SECRET,
                { expiresIn: '1h' });
            // console.log(token);
            res.send({ token });
        })

        // varify token with middleware
        const verifyToken = (req, res, next) => {
            // console.log(req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'Unauthorized Access' });
            }
            const token = req.headers.authorization.split(' ')[1]
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(403).send({ message: 'Forbidden Access' })
                }
                req.decoded = decoded;
                // console.log('from verify token', decoded)
                // console.log('error from token verify',err)
                next();
            }
            );
        }

        // users related api
        app.post('/users', async (req, res) => {
            const user = req.body;
            // insert if email if dosenot exist
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user is already exist', insertedId: null })
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        })
        app.get('/users/role/:email', async (req, res) => {
            const email = req.params.email;
            // console.log("Requested Email:", email);

            // if (email !== req.decoded.email) {
            //     // console.log("UnAuthorized Access - Email Mismatch");
            //     return res.status(403).send({ message: "Forbidden Access" });
            // }
            const query = { email: email };
            const user = await userCollection.findOne(query);
            // console.log("User:", user?.role);

            let role = null;
            if (user) {
                role = user?.role;
                // console.log(admin);
            }
            // console.log("Is Admin:", role);
            res.send( {role} );
        })
        app.get('/users', async (req, res) => {
            const result = await userCollection.find().toArray();
            // console.log(result);
            res.send(result);
        })

        // shop related api
        app.post('/addShop', async (req, res) => {
            const shopInfo = req.body;
            // insert if that users shop if dose not exist
            const emailQuery = { shopOwnerEmail: shopInfo.shopOwnerEmail }
            const shopQuery = { shopName: shopInfo.shopName }

            const existingOwner = await shopCollection.findOne(emailQuery);
            const existingShop = await shopCollection.findOne(shopQuery);
            if (existingOwner || existingShop) {
                return res.send({ message: 'Shop is already exist', insertedId: null })
            }
            const userQuery = { email: shopInfo.shopOwnerEmail }
            const update = { $set: { role: "storeManager" } };
            const userRes = await userCollection.findOneAndUpdate(userQuery, update,);
            if (!userRes) {
                return res.send({ message: 'You are already have Shop', insertedId: null })
            }
            const result = await shopCollection.insertOne(shopInfo);
            res.send(result);
        })

        //Products related API
        app.get('/products/:email', async (req, res) => {
            const email = req.params.email;
            // console.log("Requested Email inproducts:", email);
            const query = { shopOwner: email };
            const result = await productCollection.find(query).toArray();
            res.send(result);
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('inventify server running')
})

app.listen(port, () => {
    console.log(`Inventify Hub server is running in port: ${port}`);
})