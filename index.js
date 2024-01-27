const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');

require('dotenv').config()
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');


// middleware

app.use(cors({
    origin: [
        'https://inventify-hub-24f65.firebaseapp.com',
        'https://inventify-hub-24f65.web.app',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));



// app.use(cors());
app.use(express.json());
app.use(bodyParser.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@pheroprojectdbcluster.qyoezfv.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
    // connection pool for vercel
    // ==========================
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 10,
    // ==========================
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const userCollection = client.db("inventifyHubDB").collection("users");
        const joinReqCollection = client.db("inventifyHubDB").collection("joinRequests");
        const shopCollection = client.db("inventifyHubDB").collection("shops");
        const paymentCollection = client.db("inventifyHubDB").collection("payments");
        const productCollection = client.db("inventifyHubDB").collection("products");
        const cartCollection = client.db("inventifyHubDB").collection("carts");
        const invoiceCollection = client.db("inventifyHubDB").collection("saleInvoices");

        // jwt related api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(
                user,
                process.env.ACCESS_TOKEN_SECRET,
                { expiresIn: '1h' });
            res.send({ token });
        })

        // varify token with middleware
        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'Unauthorized Access' });
            }
            const token = req.headers.authorization.split(' ')[1]
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(403).send({ message: 'Forbidden Access' })
                }
                req.decoded = decoded;
                next();
            }
            );
        }

        // varify admin token with middleware
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            next();
        }
        // varify admin token with middleware
        const verifyAdminManager = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isManager = user?.role === 'storeManager' || 'admin';
            if (!isManager) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            next();
        }

        // varify shopAuthorized token with middleware
        const verifyShopAuthorized = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAuthorize = user?.role === 'storeManager' || 'shopKeeper';
            if (!isAuthorize) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            next();
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
        app.get('/users/role/:email', verifyToken, async (req, res) => {
            const email = req.params.email;

            const query = { email: email };
            const user = await userCollection.findOne(query);

            let role = null;
            if (user) {
                role = user?.role;
            }
            res.send({ role });
        })
        // get all users for admin page on allUsers
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().sort({ role: 1 }).toArray();
            res.send(result);
        })

        app.post('/joinRequest', verifyToken, async (req, res) => {
            const reqInfo = req.body;
            const userVerify = await userCollection.findOne({ email: reqInfo.candidateEmail })
            if (userVerify) {
                const result = await joinReqCollection.insertOne(reqInfo);
                res.send(result);
            } else {
                res.status(500).send({ message: 'Failed to submit request' });

            }

        })

        app.get('/joiningReq', verifyToken, async (req, res) => {
            // const shop = req.query.shopId;

            const queryReq = { selectedShopId: req.query.shopId }
            const joinRequest = await joinReqCollection.find(queryReq).toArray();
            res.send(joinRequest);
        })

        app.patch('/approvedReq', verifyToken, verifyAdminManager, async (req, res) => {
            const approvedReqInfo = req.body;
            try {
                const userUpdate = await userCollection.updateOne(
                    { email: approvedReqInfo.candidateEmail },
                    {
                        $set: {
                            role: approvedReqInfo.joinPost,
                            shopName: approvedReqInfo.selectedShopName,
                        }
                    }
                );
                if (userUpdate.acknowledged == true) {
                    const updateShop = await shopCollection.updateOne(
                        { shopId: approvedReqInfo.selectedShopId },
                        { $push: { shopEmployees: approvedReqInfo.candidateEmail } }
                    );
                    if (updateShop.acknowledged == true) {
                        const updateJoinReq = await joinReqCollection.updateOne(
                            { _id: new ObjectId(approvedReqInfo._id) },
                            { $set: { requests: 'Approved' } }
                        );
                        res.send(updateJoinReq);
                    }
                    else {

                        res.status(422).send({ message: 'Join request updated failed' });
                    }

                } else {
                    res.status(422).send({ message: 'User info updated failed' });

                }
            } catch (error) {
                res.status(500).json({ error: 'Internal Server Error' });
            }

        })
        // shop related api
        app.post('/addShop', verifyToken, async (req, res) => {
            let shopInfo = req.body;

            // Function to generate a padded 4-digit serial number
            const generateSerial = (serial) => {
                return serial.toString().padStart(4, '0');
            };
            const currentSerial = 1;
            // Remove spaces and convert to lowercase
            const formattedShopName = shopInfo.shopName.replace(/\s+/g, '').toLowerCase();
            // Generate the shopId
            const shopId = `${formattedShopName}${generateSerial(currentSerial)}`;
            // Insert the shopId into shopInfo
            shopInfo.shopId = shopId;

            // insert if that users shop if dose not exist
            const emailQuery = { shopOwnerEmail: shopInfo.shopOwnerEmail }
            const shopQuery = { shopName: shopInfo.shopName }

            const existingOwner = await shopCollection.findOne(emailQuery);
            const existingShop = await shopCollection.findOne(shopQuery);

            if (existingOwner || existingShop) {
                return res.send({ message: 'Shop is already exist', insertedId: null })
            }
            // Update the user role to manager
            const userQuery = { email: shopInfo.shopOwnerEmail }
            const update = {
                $set: {
                    role: "storeManager",
                    shopName: shopInfo.shopName,
                }
            };
            const userRes = await userCollection.findOneAndUpdate(userQuery, update,);

            // Check the user is already manager then do not create a SHOP
            if (!userRes) {
                return res.send({ message: 'You are already have Shop', insertedId: null })
            }

            const result = await shopCollection.insertOne(shopInfo);
            res.send(result);
        })

        // get shop by user specific on useShopUserWise
        app.get('/shop', verifyToken, async (req, res) => {
            const employeeEmail = req.query.employee;
            const shop = await shopCollection.findOne({ 'shopEmployees': employeeEmail });
            res.send(shop);

        })
        app.get('/allShops', verifyToken, verifyAdmin, async (req, res) => {
            const shops = await shopCollection.find().toArray();
            res.send(shops);

        })
        app.get('/recruiterShops', verifyToken, async (req, res) => {
            const shopQuery = { vacancies: { $exists: true, $ne: [] } };
            const shops = await shopCollection.find(shopQuery).toArray();
            res.send(shops);

        })

        app.delete('/deleteShop/:id', verifyToken, verifyAdmin, async (req, res) => {
            const shopId = req.params.id;
            const query = { shopId: shopId }
            try {
                const shop = await shopCollection.findOne(query);
                if (!shop) {

                    return res.status(404).json({ message: 'Shop not found' });
                }
                const emails = shop.shopEmployees;

                const updatePromises = emails.map(async (email) => {
                    const updateResult = await userCollection.updateOne(
                        { email },
                        {
                            $pull: { 'shops.shopId': shopId }, // Assuming the shops array structure
                            $set: { role: "user" } // Set the role to "user"
                        }
                    );
                    return updateResult;
                });
                const updateResults = await Promise.all(updatePromises);

                if (updateResults.some(result => result.acknowledged == true || result.acknowledged == true)) {
                    const result = await shopCollection.deleteOne({ shopId });
                    res.send(result);
                } else {
                    res.status(500).send({ message: 'Failed to update users' });

                }
            } catch (error) {
                res.status(500).send({ message: 'Internal server error' });
            }

        })

        //Products related API
        app.post('/addProduct', verifyToken, verifyAdminManager, async (req, res) => {
            let productInfo = req.body;

            const productAggregate = await productCollection.aggregate([
                {
                    $project: {
                        last5Digits: {
                            $toInt: {
                                $arrayElemAt: [
                                    { $split: ["$productId", "-"] }, -1,
                                ],
                            },
                        },
                    },
                },
                {
                    $group: {
                        _id: null,
                        maxLast5Digits: { $max: "$last5Digits" },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        maxLast5Digits: 1,
                    },
                },
            ]).toArray();

            const maxLast5Digits = productAggregate.length > 0 ? productAggregate[0].maxLast5Digits : 0;
            // Function to generate a padded 4-digit serial number
            const generateSerial = (serial) => {
                return serial.toString().padStart(5, '0');
            };
            const currentSerial = maxLast5Digits + 1;
            // Remove spaces and convert to lowercase
            const formattedShopName = "prod";
            // Generate the shopId
            const productId = `${formattedShopName}-${generateSerial(currentSerial)}`;
            // Insert the shopId into shopInfo
            productInfo.productId = productId;

            const emailQuery = { shopOwnerEmail: productInfo.shopOwnerEmail };
            const shop = await shopCollection.findOne(emailQuery);
            if (!shop) {
                return res.status(403).send({ message: 'Forbidden Access' })
            } else if (shop.productLimit <= shop.lineOfProduct) {
                return res.status(422).send({ message: 'Your limit is over' });

            }
            const updatedShop = await shopCollection.updateOne(
                emailQuery,
                {
                    $inc: {
                        // productLimit: -1,
                        lineOfProduct: 1,
                    },
                }
            );
            if (updatedShop.modifiedCount > 0) {
                const result = await productCollection.insertOne(productInfo);
                res.send(result);

            }

        })

        app.get('/allProducts', verifyToken, verifyAdmin, async (req, res) => {
            // const email = req.decoded.email;
            const result = await productCollection.find().toArray();
            res.send(result);
        })

        // get the products by shop wise on useProductsShopWise
        app.get('/products', verifyToken, verifyShopAuthorized, async (req, res) => {
            const shopId = req.query.shop;
            const query = { shopId: shopId };
            const result = await productCollection.find(query).toArray();
            res.send(result);
        })

        app.get('/product/:id', verifyToken, async (req, res) => {
            const productId = req.params.id;
            const query = { _id: new ObjectId(productId) }
            const result = await productCollection.findOne(query);
            res.send(result);
        })

        app.get('/categories', async (req, res) => {
            const shopId = req.query.shopId;

            // Add a match shop to filter by shopId
            const matchShop = { $match: { shopId: shopId } };
            const categoriesAggregate = await productCollection.aggregate([
                matchShop,
                { $group: { _id: '$category' } },
                { $project: { _id: 0, category: '$_id' } }
            ]).toArray();

            const categories = categoriesAggregate.map(categoryObject => categoryObject.category);
            res.send(categories);

        })

        app.patch('/updateProduct/:id', verifyToken, verifyAdminManager, async (req, res) => {
            const id = req.params.id;
            const productInfo = req.body;
            const query = { _id: new ObjectId(id) };
            // const options = { upsert: true };
            const updateDoc = {
                $set: {
                    name: productInfo.name,
                    image: productInfo.image,
                    category: productInfo.category,
                    stockQuantity: productInfo.stockQuantity,
                    productLocation: productInfo.productLocation,
                    productionCost: productInfo.productionCost,
                    profitMargin: productInfo.profitMargin,
                    discount: productInfo.discount,
                    description: productInfo.description,
                    sellingPrice: productInfo.sellingPrice,
                },
            };
            const result = await productCollection.updateOne(query, updateDoc);
            res.send(result);


        })

        app.delete('/deleteProduct/:id', verifyToken, verifyAdminManager, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const shop = await productCollection.findOne(query);
            const shopQuery = { shopId: shop.shopId };
            const updatedShop = await shopCollection.updateOne(
                shopQuery,
                {
                    $inc: {
                        // productLimit: -1,
                        lineOfProduct: -1,
                    },
                }
            );
            if (updatedShop.modifiedCount > 0) {
                const result = await productCollection.deleteOne(query);
                res.send(result);
            }

        })

        // carts collection
        app.get('/carts', verifyToken, verifyShopAuthorized, async (req, res) => {
            const shopId = req.query.shop;
            const query = { shopId: shopId };
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/carts', verifyToken, verifyShopAuthorized, async (req, res) => {
            let cartItem = req.body;
            const productQuery = { productId: cartItem.productId };

            const product = await productCollection.findOne(productQuery);
            if (product.stockQuantity > 0) {
                const updatedProd = await productCollection.updateOne(
                    productQuery,
                    {
                        $inc: {
                            stockQuantity: -1,
                        },
                    }
                );
                if (updatedProd.modifiedCount > 0) {
                    const result = await cartCollection.insertOne(cartItem);
                    res.send(result);
                }
            } else {
                res.status(422).send({ error: 'Product Stock nill' });
            }

        })

        // Sale Invoice collection
        app.post('/saleInvoice', verifyToken, verifyShopAuthorized, async (req, res) => {
            try {
                const invoiceInfo = req.body;
                const invoiceNumber = invoiceInfo.invoiceNumber;
                const invoiceDate = invoiceInfo.invoiceDate;

                const additionalInvoiceInfo = {
                    invoiceNumber,
                    invoiceDate,
                };

                const getAllCartOfShop = await cartCollection.find({ shopId: invoiceInfo.shopId }).toArray();

                const itemsWithInvoiceId = getAllCartOfShop.map(item => ({ ...item, ...additionalInvoiceInfo }));

                const aggregateResult = await cartCollection.aggregate([
                    {
                        $match: { shopId: invoiceInfo.shopId }
                    },
                    {
                        $group: {
                            _id: '$productId',
                            shopId: { $first: '$shopId' },
                            totalSaleQuantity: { $sum: '$saleQuantity' }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            productId: '$_id',
                            shopId: 1,
                            totalSaleQuantity: 1
                        }
                    }
                ]).toArray();

                if (getAllCartOfShop.length > 0) {
                    // Iterate over each result from the aggregation
                    for (const result of aggregateResult) {
                        const { productId, shopId, totalSaleQuantity } = result;

                        // Update the saleCount for the product in productCollection
                        await productCollection.updateOne(
                            { productId, shopId },
                            { $inc: { saleCount: totalSaleQuantity } }
                        );
                    }

                    // Save data to the invoiceCollection
                    const deleteAllCartOfShop = await cartCollection.deleteMany({ shopId: invoiceInfo.shopId });
                    if (deleteAllCartOfShop.deletedCount < 0) {
                        return res.status(422).send({ message: 'Check-Out product cannot be cleared.' });
                    }

                    // Send the response after completing all operations
                    const result = await invoiceCollection.insertMany(itemsWithInvoiceId);
                    if (result.insertedCount > 0) {
                        return res.send(result);
                    } else {
                        return res.status(422).send({ message: 'Generate invoice failed.' });
                    }
                } else {
                    return res.status(422).send({ message: 'No items found for Generate Bill' });
                }
            } catch (error) {
                return res.status(500).send({ message: 'Internal Server Error' });
            }
        });

        // to get sale items of individual shop in ShopHome
        app.get('/saleItems', verifyToken, async (req, res) => {
            const shopQuery = { shopId: req.query.shop }
            const result = await invoiceCollection.find(shopQuery).toArray();
            res.send(result);

        });


        app.get('/shopInvoice', async (req, res) => {
            try {
                const shopId = req.query.shop;
                const result = await invoiceCollection.aggregate([
                    { $match: { shopId: shopId } },
                    {
                        $group: {
                            _id: { invoiceNumber: "$invoiceNumber", shopId: "$shopId" }
                        }
                    },
                    {
                        $project: {
                            _id: 0, // Exclude the _id field
                            invoiceNumber: "$_id.invoiceNumber",
                            shopId: "$_id.shopId"
                        }
                    }
                ]).toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send("Internal Server Error");
            }
        });
        app.get('/invoice', async (req, res) => {
            const invId = req.query.inv;
            const result = await invoiceCollection.find({ invoiceNumber: invId }).toArray();
            res.send(result);
        });

        //Create a PaymentIntent
        app.post("/create-payment-intent", async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                "payment_method_types": [
                    "card",

                ],
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.post('/payments', async (req, res) => {
            try {
                const paymentInfo = req.body;

                const paymentResult = await paymentCollection.insertOne(paymentInfo);

                if (paymentResult.insertedId) {
                    const insertedIdString = paymentResult.insertedId.toString();
                    const shopQuery = { shopId: paymentInfo.shopId };

                    const updatedShop = await shopCollection.updateOne(
                        shopQuery,
                        {
                            $inc: {
                                productLimit: paymentInfo.limit,
                                purchaseCount: 1,
                            },
                            $push: {
                                paymentIds: insertedIdString,
                            },
                        }
                    );
                    if (updatedShop.acknowledged === true) {
                        res.send(updatedShop);
                    } else {
                        res.status(500).send('Failed to update shop information.Please contact IT dept.');
                    }
                } else {
                    res.status(500).send('Failed to process this payment. Contact It dept.');
                }
            } catch (error) {
                res.status(500).send('Internal Server Error. Contact It dept.');
            }
        });


        app.get('/shop-payment', verifyToken, verifyAdmin, async (req, res) => {
            const result = await paymentCollection.find().toArray();
            res.send(result);
        });


        app.get('/chart-data', verifyToken, async (req, res) => {
            try {
                const shopQuery = { shopId: req.query.shop };

                const result = await invoiceCollection.aggregate([
                    { $match: shopQuery },
                    {
                        $group: {
                            _id: "$invoiceNumber",
                            totalBuyingPriceWhVat: { $sum: "$buyingPriceWhVat" },
                            totalDiscount: { $sum: "$discount" },
                            totalSaleQuantity: { $sum: "$saleQuantity" },
                            totalTotalPriceWhDisc: { $sum: "$totalPriceWhDisc" },
                        },
                    },
                    {
                        $project: {
                            _id: 0, // Exclude _id field from the result
                            invoiceNumber: "$_id",
                            totalBuyingPriceWhVat: 1,
                            totalDiscount: 1,
                            totalSaleQuantity: 1,
                            totalTotalPriceWhDisc: 1,
                            totalProfit: { $subtract: ["$totalTotalPriceWhDisc", "$totalBuyingPriceWhVat"] },
                        },
                    },
                    { $sort: { invoiceNumber: 1 } }, // Sort by invoiceNumber in ascending order
                ]).toArray();

                res.send(result);
            } catch (error) {
                res.status(500).send({ error: "Internal Server Error" });
            }
        });

        // get chart data only for admin on adminHome
        app.get('/admin-chartData', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const aggregationPipeline = [
                    {
                        $group: {
                            _id: '$shopId',
                            shopName: { $first: '$shopName' },
                            purchaseCount: { $sum: 1 },
                            totalPurchaseAmt: { $sum: '$paidAmount' },
                            totalLimit: { $sum: '$limit' },
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            shopId: '$_id',
                            shopName: 1,
                            purchaseCount: 1,
                            totalPurchaseAmt: 1,
                            totalLimit: 1,
                        }
                    }
                ];

                const result = await paymentCollection.aggregate(aggregationPipeline).toArray();

                res.json(result);
            } catch (error) {
                res.status(500).send('Internal Server Error');
            }
        });



        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
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