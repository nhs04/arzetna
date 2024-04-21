const admin = require("firebase-admin");
const express = require('express');
const app = express()
const path = require('path')
const session = require('express-session')
const bcrypt = require('bcrypt');
const hbs = require('hbs')
const fs = require('fs')
const exphbs = require('express-handlebars')
const { Storage } = require('@google-cloud/storage');
const os = require('os');
const multer = require('multer');



app.use(express.json())
app.set("view engine", "hbs");
app.use(express.urlencoded({extended:false}))
app.use(express.static('public'));

app.set('view engine', '.hbs');


app.use(session({
    secret: 'my-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // Expiry time in milliseconds (1 day)
        // Other cookie options if needed
      },
  }));


// Initialize Firebase Admin SDK with service account
const serviceAccount = require("./firebase/firebase_connect.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Get a reference to the Firestore service
const db = admin.firestore();

const storage = new Storage({
    projectId: 'farmers-shop-d541e',
    keyFilename: "./firebase/firebase_connect.json"
});

const bucket = storage.bucket('gs://farmers-shop-d541e.appspot.com');

const upload = multer({ dest: 'uploads/' });

app.get('/', async (req,res)=>{
    const isLoggedIn = req.session.isLoggedIn;
    const isSeller = req.session.isSeller;
    const userName = req.session.userName;
    const userId = req.session.userId;
    res.render("homepage", {title: "Homepage", isLoggedIn: isLoggedIn, isSeller: isSeller, userName: userName, userId: userId});
});

app.get('/homepage', async (req,res)=>{
    res.render("homepage", {
        title: "Homepage",
     isLoggedIn: req.session.isLoggedIn,
     isSeller: req.session.isSeller,
     userName: req.session.userName,
      userId: req.session.userId
    });
});

app.get('/login', async (req,res)=>{
    res.render("login", {
        title: "Login",
     isLoggedIn: req.session.isLoggedIn,
     isSeller: req.session.isSeller,
     userName: req.session.userName,
      userId: req.session.userId
    });
});

app.post('/api/login', async (req,res)=>{
    const password = req.body.password;
    const username = req.body.username;
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('username', '==', username).get();
    if (snapshot.empty) {
        res.status(404).send("User not found");
        return;
    }
    snapshot.forEach(async doc => {
        const data = doc.data();
        const hashedPassword = data.password;
        const isMatch = await bcrypt.compare(password, hashedPassword);
        if (isMatch){
            req.session.isLoggedIn = true;
            req.session.isSeller = data.role == "SELLER"
            req.session.userName = data.username;
            req.session.userId = doc.id;
            res.render("homepage", {
                title: "Homepage",
             isLoggedIn: req.session.isLoggedIn,
             isSeller: req.session.isSeller,
             userName: req.session.userName,
              userId: req.session.userId
            });
        } else {
            res.status(400).send("Incorrect password");
        }
    });
});

app.get('/signup', async (req,res)=>{
    res.render("signup", {
        title: "Sign Up",
     isLoggedIn: req.session.isLoggedIn,
     isSeller: req.session.isSeller,
     userName: req.session.userName,
      userId: req.session.userId
    });
});

app.get('/buyer/shop', async (req,res)=>{
    //Get the shops from the database
    const shopsRef = db.collection('shops');
    const snapshot = await shopsRef.get();
    const shops = [];
    //Add the shops to the list with each shop's id
    snapshot.forEach(doc => {
        shops.push({shopId: doc.id, ...doc.data()});
    });
    res.render("shops", {
     isLoggedIn: req.session.isLoggedIn,
     isSeller: req.session.isSeller,
     userName: req.session.userName,
      userId: req.session.userId,
      shops: shops
    });
});

app.get('/shop/:shopId/products', async (req, res) => {
    try {
        const shopId = req.params.shopId; // Retrieve shopId from URL params

        // Query products collection to get products belonging to the shop
        const productsSnapshot = await admin.firestore().collection('products').where('shopId', '==', shopId).get();

        const productList = [];
        productsSnapshot.forEach(doc => {
            const productData = doc.data();
            // Add the actual document ID to the product data
            productList.push({ productId: doc.id, ...productData });
        });

        // Send products data as the response
        res.render('products', {
            isLoggedIn: req.session.isLoggedIn,
            isSeller: req.session.isSeller,
            userName: req.session.userName,
            userId: req.session.userId,
            products: productList
        });
    } catch (error) {
        console.error(error);
        res.send("Error getting products");
    }
});


app.get("/seller/addproduct", async (req,res)=>{
    if (!req.session.isSeller){
        res.render("401", {
            title: "Unauthorized",
            isLoggedIn: req.session.isLoggedIn,
            isSeller: req.session.isSeller,
            userName: req.session.userName,
            userId: req.session.userId
        });
        return;
    }
    res.render("addproduct", {
    title: "Add Product",
     isLoggedIn: req.session.isLoggedIn,
     isSeller: req.session.isSeller,
     userName: req.session.userName,
     userId: req.session.userId
    });
});

app.get("/seller/products", async (req,res)=>{
    if (!req.session.isSeller){
        res.render("401", {
            title: "Unauthorized",
            isLoggedIn: req.session.isLoggedIn,
            isSeller: req.session.isSeller,
            userName: req.session.userName,
            userId: req.session.userId
        });
        return;
    }

    const shopsRef = db.collection('shops');
    const snapshot = await shopsRef.where('username', '==', req.session.userName).get();
    if (snapshot.empty) {
        res.send("No matching documents");
        return;
    }
    const shopId = snapshot.docs[0].id;

    const productsRef = db.collection('products');
    const productsSnapshot = await productsRef.where('shopId', '==', shopId).get();
    const products = [];
    productsSnapshot.forEach(doc => {
        products.push({productId: doc.id, ...doc.data()});
    });
    res.render("sellerproducts", {
    title: "Products",
     isLoggedIn: req.session.isLoggedIn,
     isSeller: req.session.isSeller,
     userName: req.session.userName,
      userId: req.session.userId,
      products: products
    });
});



app.get("/buyer/cart", async (req,res)=>{
    if (!req.session.isLoggedIn){
        res.render("401", {
            title: "Unauthorized",
            isLoggedIn: req.session.isLoggedIn,
            isSeller: req.session.isSeller,
            userName: req.session.userName,
            userId: req.session.userId
        });
        return;
    }
    const cartsRef = db.collection('carts');
    const snapshot = await cartsRef.where('userId', '==', req.session.userId).get();
    if (snapshot.empty) {
        res.render("cart", {
            title: "Cart",
            isLoggedIn: req.session.isLoggedIn,
            isSeller: req.session.isSeller,
            userName: req.session.userName,
            userId: req.session.userId,
            cart: null
        });
        return;
    }
    const cart = snapshot.docs[0].data();
    res.render("cart", {
    title: "Cart",
     isLoggedIn: req.session.isLoggedIn,
     isSeller: req.session.isSeller,
     userName: req.session.userName,
      userId: req.session.userId,
      cart: cart
    });
});


app.get("/seller/getorders", async (req, res) => {
    if (!req.session.isSeller){
        res.render("401", {
            title: "Unauthorized",
            isLoggedIn: req.session.isLoggedIn,
            isSeller: req.session.isSeller,
            userName: req.session.userName,
            userId: req.session.userId
        });
        return;
    }

    const shopsRef = db.collection('shops');
    const snapshot = await shopsRef.where('username', '==', req.session.userName).get();
    if (snapshot.empty) {
        res.send("No matching documents");
        return;
    }
    const shopId = snapshot.docs[0].id;

    const ordersRef = db.collection('orders').where('shopId', '==', shopId);
    const ordersSnapshot = await ordersRef.get();
    const orders = [];

    await Promise.all(ordersSnapshot.docs.map(async doc => {
        const orderData = doc.data();
        const buyerUserSnapshot = await db.collection('users').doc(orderData.userId).get();
        const buyerUsername = buyerUserSnapshot.data().username;
        orders.push({ orderId: doc.id, buyerUsername, ...orderData });
    }));
    res.render("orders", {
        title: "Orders",
        isLoggedIn: req.session.isLoggedIn,
        isSeller: req.session.isSeller,
        userName: req.session.userName,
        userId: req.session.userId,
        orders: orders
    });
});

app.get("/my-profile", async (req,res)=>{
    //Get the user's profile data
    const userId = req.session.userId;
    const usersRef = db.collection('users');
    const userSnapshot = await usersRef.doc(userId).get();
    if (!userSnapshot.exists) {
        res.send("No matching documents");
        return;
    }
    const userData = userSnapshot.data();
    res.render("profile", {
        title: "Profile",
     isLoggedIn: req.session.isLoggedIn,
     isSeller: req.session.isSeller,
     userName: req.session.userName,
    userId: req.session.userId,
    data: userData
    });
});

app.get('/logout', async (req,res)=>{
    req.session.isLoggedIn = false;
    req.session.isSeller = false;
    req.session.userName = "";
    req.session.userId = "";
    res.render("homepage", {
        title: "Homepage",
     isLoggedIn: req.session.isLoggedIn,
     isSeller: req.session.isSeller,
     userName: req.session.userName,
      userId: req.session.userId
    });
});

app.listen(3001,()=>{
    console.log("Server is running on port 3001")
})

async function createDocument(collectionName, documentData) {
    try {
      const docRef = await db.collection(collectionName).add(documentData);
      return docRef;
    } catch (error) {
      console.error("Error adding document: ", error);
      return null;
    }
  }

  //Generate a hashed password
async function hashPassword(password){
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password,salt);
    return hashedPassword;
}