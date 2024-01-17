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

        app.get('/products', async (req, res) => {
            const result = await productCollection.find().toArray();
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