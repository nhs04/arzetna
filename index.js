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

app.use(async (req, res, next) => {
    if (
      !req.path.endsWith("logout") &&
      !session.user &&
      (req.signedCookies?.userId || req.cookies?.userId)
    ) {
      // Load user from the database using the userId stored in the cookie
      const authService = new AuthService();
      // Attempt to find a user that has a related seller profile
      session.user = await authService.getUserById(
        parseInt(req.signedCookies?.userId || req.cookies?.userId)
      );
      console.log("Loaded user with seller info", session.user);
    }
    // Set a global variable accessible in all templates
    res.locals.currentUser = session.user;
  
    if (session.user) {
      res.locals.isSeller = !!session.user.seller;
      res.locals.isBuyer = !!session.user.buyer;
      res.locals.isAdmin = session.user.userType == "admin";
    }
  
    next();
  });
  

app.get('/', async (req,res)=>{
    const isLoggedIn = req.session.isLoggedIn;
    const isSeller = req.session.isSeller;
    const userName = req.session.userName;
    const userId = req.session.userId;
    const isAdmin = req.session.isAdmin;
    res.render("homepage", {title: "Homepage", isLoggedIn: isLoggedIn, isSeller: isSeller, userName: userName, userId: userId, isAdmin: isAdmin});
});

app.get('/homepage', async (req,res)=>{
    res.render("homepage", {
        title: "Homepage",
     isLoggedIn: req.session.isLoggedIn,
     isSeller: req.session.isSeller,
     userName: req.session.userName,
        userId: req.session.userId,
        isAdmin: req.session.isAdmin
    });
});

app.get('/login', async (req,res)=>{
    res.render("login", {
        title: "Login",
        isLoggedIn: req.session.isLoggedIn,
        isSeller: req.session.isSeller,
        userName: req.session.userName,
           userId: req.session.userId,
           isAdmin: req.session.isAdmin
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
            req.session.isAdmin = data.role == "ADMIN";
            res.render("homepage", {
                title: "Homepage",
                isLoggedIn: req.session.isLoggedIn,
                isSeller: req.session.isSeller,
                userName: req.session.userName,
                   userId: req.session.userId,
                   isAdmin: req.session.isAdmin
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
           userId: req.session.userId,
           isAdmin: req.session.isAdmin
    });
});

app.post('/api/signup', upload.single('shopImage'), async (req, res) => {
    try {

        // Check if the user already exists
        const usersRef = db.collection('users');
        const usernameSnapshot = await usersRef.where('username', '==', req.body.userName).get();
        const emailSnapshot = await usersRef.where('email', '==', req.body.email).get();

        if (!usernameSnapshot.empty) {
            res.status(400).send("User already exists");
            return;
        }

        if (!emailSnapshot.empty) {
            res.status(400).send("Email already exists");
            return;
        }

        const { userName, password, role, email, shopName, description } = req.body;

        // Hash password
        const hashedPassword = await hashPassword(password);

        // Create user document
        const userData = {
            username: userName,
            password: hashedPassword,
            email: email,
            role: role,
            emailApproved: false,
            adminApproved: role === "BUYER" ? true : false
        };
        const userRef = await createDocument('users', userData);

        // Set session variables
        req.session.isLoggedIn = true;
        req.session.isSeller = role === "SELLER";
        req.session.userName = userName;
        req.session.userId = userRef.id;
        req.session.isAdmin = role === "ADMIN";

        // Create shop document if user is a seller
        if (role === "SELLER") {
            // Upload image to Firebase Storage
            const fileName = `${Date.now()}_${req.file.originalname}`;

            await bucket.upload(req.file.path, {
                destination: `shops/${fileName}`,
                metadata: {
                    contentType: req.file.mimetype
                }
            });

            const imageLink = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/shops%2F${encodeURIComponent(fileName)}?alt=media`;

            // Create shop data
            const shopData = {
                userId: userRef.id,
                userActive: false,
                shopName: shopName,
                description: description,
                imageLink: imageLink,
                isActive: false,
            };

            // Create shop document
            const shopRef = await createDocument('shops', shopData);

            if (shopRef) {
            } else {
                res.status(500).send("Error creating shop");
                return;
            }
        }

        res.render("homepage", {
            title: "Homepage",
            isLoggedIn: req.session.isLoggedIn,
            isSeller: req.session.isSeller,
            userName: req.session.userName,
               userId: req.session.userId,
               isAdmin: req.session.isAdmin
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Error creating user');
    }
});


app.get('/buyer/shop', async (req,res)=>{
    //Get the shops from the database
    const shopsRef = db.collection('shops');

    //Get the shops where isActive = true and userActive = true
    const snapshot = await shopsRef.where('isActive', '==', true).where('userActive', '==', true).get();

    const shops = [];
    snapshot.forEach(doc => {
        shops.push({shopId: doc.id, ...doc.data()});
    });
    res.render("shops", {
        isLoggedIn: req.session.isLoggedIn,
        isSeller: req.session.isSeller,
        userName: req.session.userName,
           userId: req.session.userId,
           isAdmin: req.session.isAdmin,
      shops: shops
    });
});

app.get('/shop/:shopId/products', async (req, res) => {
    try {
        const shopId = req.params.shopId; // Retrieve shopId from URL params

        // Query products collection to get products belonging to the shop
        const productsSnapshot = await admin.firestore().collection('products').where('shopId', '==', shopId).get();

        const productList = [];
        for (const doc of productsSnapshot.docs) {
            const productData = doc.data();
            //Get all the reviews for this product;
            const reviewsRef = db.collection('reviews').where('productId', '==', doc.id);
            const reviewsSnapshot = await reviewsRef.get(); // Await here

            const reviews = [];
            reviewsSnapshot.forEach(reviewDoc => {
                reviews.push(reviewDoc.data());
            });

            console.log(reviews);

            // Add the actual document ID to the product data
            productList.push({ productId: doc.id, reviews: reviews, ...productData });
        }

        console.log(productList);

        // Send products data as the response
        res.render('products', {
            isLoggedIn: req.session.isLoggedIn,
            isSeller: req.session.isSeller,
            userName: req.session.userName,
            userId: req.session.userId,
            isAdmin: req.session.isAdmin,
            products: productList
        });
    } catch (error) {
        console.error(error);
        res.send("Error getting products");
    }
});



// Express route to add a product to the user's cart
app.post('/api/cart/add-product', async (req, res) => {
    try {
        const userId = req.session.userId;
        if (!userId){
            res.status(401).send('Unauthorized');
            return;
        }
        const productId = req.body.productId;
        const productQuantity = parseInt(req.body.quantity);

        //Get the productPrice from the product doc
        const productRef = db.collection('products').doc(productId);
        const productDoc = await productRef.get();
        const productData = productDoc.data();
        const productPrice = productData.price;

        //Get the product name, imagelink, currency
        const productName = productData.name;
        const imageLink = productData.imageLink;
        const currency = productData.currency;


        // Check if a cart already exists for the user
        const cartRef = admin.firestore().collection('carts').where('userId', '==', userId);
        const cartSnapshot = await cartRef.get();

        if (cartSnapshot.empty) {
            // Create a new cart document if it doesn't exist
            const newCart = {
                userId: userId,
                products: [{
                    productId: productId,
                    price: productPrice, 
                    quantity: productQuantity,
                    name: productName,
                    imageLink: imageLink,
                    currency: currency
                }],
                totalPrice: (productPrice * productQuantity).toFixed(2)
            };

            await admin.firestore().collection('carts').add(newCart);
            res.status(200).send('Product added to cart successfully');
            return;
        }
            // Get the first cart document (assuming a user can have only one cart)
            const cartDoc = cartSnapshot.docs[0];

            const shopId = productData.shopId;
            const cartProductId = cartDoc.data().products[0].productId;
            //Get the shopId of the first product in the cart
            const productRef2 = db.collection('products').doc(cartProductId);
            const productDoc2 = await productRef2.get();
            const productData2 = productDoc2.data();
            const shopId2 = productData2.shopId;

            
            //If the first product in the cart's shop id is different from the product's shop id, return an error
            if (shopId2 != shopId){
                res.status(400).send('You can only add products from the same shop to your cart');
                return;
            }

            //Check if the product exists
            var productExists = false;
            cartDoc.data().products.forEach(product => {
                if (product.productId === productId){
                    productExists = true;
                }
            });

            if (productExists){
            var newProductsList = cartDoc.data().products.map(product => {
                if (product.productId === productId){
                    product.quantity += productQuantity;
                }
                    return product;
                });
                //Commit the changes to the cart
                await cartDoc.ref.update({
                    products: newProductsList,
                    totalPrice: newProductsList.reduce((acc, product) => acc + product.price * product.quantity, 0).toFixed(2)
                });
                res.status(200).send('Product added to cart successfully');
                return;
            }
            // Update the cart document with the new product and recalculate the total price
            const newProducts = [...cartDoc.data().products, {                     productId: productId,
                price: productPrice, 
                quantity: productQuantity,
                name: productName,
                imageLink: imageLink,
                currency: currency}];
            const newTotalPrice = newProducts.reduce((acc, product) => acc + product.price * product.quantity, 0).toFixed(2);

            // Update the cart document in Firestore
            await cartDoc.ref.update({
                products: newProducts,
                totalPrice: newTotalPrice
            });
        res.status(200).send('Product added to cart successfully');
        return;
    } catch (error) {
        console.error('Error adding product to cart:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post("/api/addproduct", upload.single('productImage'),async (req, res) => {
    if (!req.session.isSeller) {
        res.render("401", {
            title: "Unauthorized",
            isLoggedIn: req.session.isLoggedIn,
            isSeller: req.session.isSeller,
            userName: req.session.userName,
               userId: req.session.userId,
               isAdmin: req.session.isAdmin
        });
        return;
    }

    const productName = req.body.name;
    const productPrice = parseFloat(req.body.price);
    const isAvailable = true;
    const currency = "USD";

    // Get the shopId by the userId
    const shopsRef = db.collection('shops');
    const snapshot = await shopsRef.where('userId', '==', req.session.userId).get();
    if (snapshot.empty) {
        res.send("No matching documents");
        return;
    }
    const shopId = snapshot.docs[0].id;

    // Upload image to Firebase Storage
    const productImage = req.file;
    const fileName = `${Date.now()}_${productImage.originalname}`;

    try {
        var uploadResp = await bucket.upload(productImage.path, {
            destination: `products/${fileName}`,
            metadata: {
                contentType: productImage.mimetype
            }
        });
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).send('Error uploading image');
        return;
    }

    const imageLink = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/products%2F${encodeURIComponent(fileName)}?alt=media`;
    const productData = {
        name: productName,
        price: productPrice,
        isAvailable: isAvailable,
        currency: currency,
        shopId: shopId,
        imageLink: imageLink
    };

    const docRef = await createDocument('products', productData);
    if (docRef) {
        res.redirect('/seller/products');
    } else {
        res.send("Error adding product");
    }
});

app.get("/seller/addproduct", async (req,res)=>{
    if (!req.session.isSeller){
        res.render("401", {
            title: "Unauthorized",
            isLoggedIn: req.session.isLoggedIn,
            isSeller: req.session.isSeller,
            userName: req.session.userName,
               userId: req.session.userId,
               isAdmin: req.session.isAdmin
        });
        return;
    }
    res.render("addproduct", {
    title: "Add Product",
    isLoggedIn: req.session.isLoggedIn,
    isSeller: req.session.isSeller,
    userName: req.session.userName,
       userId: req.session.userId,
       isAdmin: req.session.isAdmin
    });
});

app.get("/seller/products", async (req,res)=>{
    if (!req.session.isSeller){
        res.render("401", {
            title: "Unauthorized",
            isLoggedIn: req.session.isLoggedIn,
            isSeller: req.session.isSeller,
            userName: req.session.userName,
               userId: req.session.userId,
               isAdmin: req.session.isAdmin
        });
        return;
    }

    const shopsRef = db.collection('shops');
    const snapshot = await shopsRef.where('userId', '==', req.session.userId).get();
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
       isAdmin: req.session.isAdmin,
      products: products
    });
});

app.post("/api/product/delete", async (req,res)=>{
    if (!req.session.isSeller){
        res.render("401", {
            title: "Unauthorized",
            isLoggedIn: req.session.isLoggedIn,
            isSeller: req.session.isSeller,
            userName: req.session.userName,
               userId: req.session.userId,
               isAdmin: req.session.isAdmin,
        });
        return;
    }

    const productId = req.body.productId;
    const productRef = db.collection('products').doc(productId);
    await productRef.delete();

    //Remove this product from all of the carts if it exists.
    const cartsRef = db.collection('carts');
    const cartsSnapshot = await cartsRef.get();
    cartsSnapshot.forEach(async doc => {
        const cartData = doc.data();
        const newProductsList = cartData.products.filter(product => product.productId != productId);
        await doc.ref.update({
            products: newProductsList,
            totalPrice: newProductsList.reduce((acc, product) => acc + product.price * product.quantity, 0)
        });
    });
    res.status(200).send("Product deleted successfully");
});

app.post("/api/product/edit", async (req,res)=>{
    if (!req.session.isSeller){
        res.render("401", {
            title: "Unauthorized",
            isLoggedIn: req.session.isLoggedIn,
            isSeller: req.session.isSeller,
            userName: req.session.userName,
               userId: req.session.userId,
               isAdmin: req.session.isAdmin
        });
        return;
    }

    const productId = req.body.productId;
    const productName = req.body.name;
    const productPrice = parseFloat(req.body.price);
    const isAvailable = req.body.isAvailable;
    const currency = "USD";
    const imageLink = req.body.imageLink;

    const productRef = db.collection('products').doc(productId);
    await productRef.update({
        name: productName,
        price: productPrice,
        isAvailable: isAvailable,
        currency: currency,
        imageLink: imageLink
    });
    res.status(200).send("Product edited successfully");
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
               isAdmin: req.session.isAdmin,
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

app.post("/api/cart/remove", async (req,res)=>{
    const userId = req.session.userId;
    const cartsRef = db.collection('carts');
    const snapshot = await cartsRef.where('userId', '==', userId).get();
    if (snapshot.empty) {
        res.send("Your cart is currently empty.");
        return;
    }
    //If the quantity > 1, reduce quantity by 1, else delete the product from the cart
    const productId = req.body.productId;
    const cartDoc = snapshot.docs[0];
    const cartData = cartDoc.data();
    if (cartData.products.length == 1 && cartData.products[0].productId == productId && cartData.products[0].quantity == 1){
        await cartDoc.ref.delete();
        res.status(200).send("Cart deleted successfully");
        return;
    }
    //Get the product from the cart
    const product = cartData.products.find(product => product.productId == productId);
    if (product.quantity > 1){
        const newProductsList = cartData.products.map(product => {
            if (product.productId == productId){
                product.quantity -= 1;
            }
            return product;
        });
        await cartDoc.ref.update({
            products: newProductsList,
            totalPrice: newProductsList.reduce((acc, product) => acc + product.price * product.quantity, 0)
        });
        res.status(200).send("Product quantity reduced successfully");
        return;
    }
    const newProductsList = cartData.products.filter(product => product.productId != productId);
    await cartDoc.ref.update({
        products: newProductsList,
        totalPrice: newProductsList.reduce((acc, product) => acc + product.price * product.quantity, 0)
    });
    res.status(200).send("Product deleted successfully");
});

app.post("/api/cart/checkout", async (req,res)=>{
    const userId = req.session.userId;
    //Get the user's adminApproved status
    const userRef = db.collection('users').doc(userId);
    const userSnapshot = await userRef.get();
    if (!userSnapshot.exists) {
        res.send("No matching documents");
        return;
    }
    const userData = userSnapshot.data();

    console.log(userData);
    if (userData.adminApproved == false){
        res.status(401).send("You are not approved to place orders");
        return;
    }

    const cartsRef = db.collection('carts');
    const snapshot = await cartsRef.where('userId', '==', userId).get();
    if (snapshot.empty) {
        res.send("Your cart is currently empty.");
        return;
    }
    const cartDoc = snapshot.docs[0];
    const cartData = cartDoc.data();
    //Get the product from the cart
    const productRef = db.collection('products');
    const productSnapshot = await productRef.doc(cartData.products[0].productId).get();
    
    //Get the shopId from the product
    const shopId = productSnapshot.data().shopId;

    //Create a new order document
    const orderData = {
        userId: userId,
        shopId: shopId,
        products: cartData.products,
        totalPrice: cartData.totalPrice,
        //String with the current date
        createdDate: new Date().toLocaleTimeString()
    };
    const orderRef = await createDocument('orders', orderData);
    if (orderRef){
        //Delete the cart
        await cartDoc.ref.delete();
        res.status(200).send("Order placed successfully");
        return;
    }
    res.send("Error placing order");
});
app.get("/seller/getorders", async (req, res) => {
    if (!req.session.isSeller){
        res.render("401", {
            title: "Unauthorized",
            isLoggedIn: req.session.isLoggedIn,
            isSeller: req.session.isSeller,
            userName: req.session.userName,
               userId: req.session.userId,
               isAdmin: req.session.isAdmin
        });
        return;
    }

    const shopsRef = db.collection('shops');
    const snapshot = await shopsRef.where('userId', '==', req.session.userId).get();
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
        isAdmin: req.session.isAdmin,
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
           isAdmin: req.session.isAdmin,
    data: userData
    });
});

app.get('/logout', async (req,res)=>{
    req.session.isLoggedIn = false;
    req.session.isSeller = false;
    req.session.userName = "";
    req.session.userId = "";
    req.session.isAdmin = false;
    res.render("homepage", {
        title: "Homepage",
     isLoggedIn: req.session.isLoggedIn,
     isSeller: req.session.isSeller,
     userName: req.session.userName,
      userId: req.session.userId
    });
});

app.get('/admin/sellerrequests', async (req,res)=>{
    if (!req.session.isAdmin){
        res.render("401", {
            title: "Unauthorized",
            isLoggedIn: req.session.isLoggedIn,
            isSeller: req.session.isSeller,
            userName: req.session.userName,
               userId: req.session.userId,
               isAdmin: req.session.isAdmin
        });
    }
    //Get all the users from the database where role == SELLER, order by adminApproved
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('role', '==', 'SELLER').get();
    const users = [];
    snapshot.forEach(doc => {
        users.push({userId: doc.id, ...doc.data()});
    });
    console.log(users);
    res.render("sellerrequests", {
        title: "Seller Requests",
        isLoggedIn: req.session.isLoggedIn,
        isSeller: req.session.isSeller,
        userName: req.session.userName,
           userId: req.session.userId,
           isAdmin: req.session.isAdmin,
        users: users
    });
});

app.get('/admin/approve-seller/:userId', async (req,res)=>{
    if (!req.session.isAdmin){
        res.render("401", {
            title: "Unauthorized",
            isLoggedIn: req.session.isLoggedIn,
            isSeller: req.session.isSeller,
            userName: req.session.userName,
               userId: req.session.userId,
               isAdmin: req.session.isAdmin
        });
    }
    
    const userId = req.params.userId
    console.log(userId);
    const userRef = db.collection('users').doc(userId);
    //get the user's data
    const userSnapshot = await userRef.get();

    await userRef.update({
        adminApproved: !userSnapshot.data().adminApproved
    });

    const shopRef = db.collection('shops').where('userId', '==', userId);
    const shopSnapshot = await shopRef.get();
    if (shopSnapshot.empty){
        res.send("No matching documents");
        return;
    }
    const shopDoc = shopSnapshot.docs[0];
    await shopDoc.ref.update({
        userActive: !userSnapshot.data().adminApproved,
        isActive: !userSnapshot.data().adminApproved
    });
    res.redirect('/admin/sellerrequests');
    return;
});

app.get('/admin/getbuyers', async (req,res) => {
    //Get all the buyers, along with their total spent to date.
    if (!req.session.isAdmin){
        res.render("401", {
            title: "Unauthorized",
            isLoggedIn: req.session.isLoggedIn,
            isSeller: req.session.isSeller,
            userName: req.session.userName,
               userId: req.session.userId,
               isAdmin: req.session.isAdmin
        });
    }
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('role', '==', 'BUYER').get();
    const users = [];
    await Promise.all(snapshot.docs.map(async doc => {
        const userId = doc.id;
        const ordersRef = db.collection('orders').where('userId', '==', userId);
        const ordersSnapshot = await ordersRef.get();
        const totalSpent = ordersSnapshot.docs.reduce((acc, order) => acc + order.data().totalPrice, 0);
        users.push({userId: userId, totalSpent: totalSpent, ...doc.data()});
    }));

    res.render("buyers", {
        title: "Buyers",
        isLoggedIn: req.session.isLoggedIn,
        isSeller: req.session.isSeller,
        userName: req.session.userName,
           userId: req.session.userId,
           isAdmin: req.session.isAdmin,
        users: users
    });
});


app.get('/admin/approve-buyer/:userId', async (req,res)=>{
    if (!req.session.isAdmin){
        res.render("401", {
            title: "Unauthorized",
            isLoggedIn: req.session.isLoggedIn,
            isSeller: req.session.isSeller,
            userName: req.session.userName,
               userId: req.session.userId,
               isAdmin: req.session.isAdmin
        });
    }
    
    const userId = req.params.userId

    const userRef = db.collection('users').doc(userId);
    //get the user's data
    const userSnapshot = await userRef.get();

    await userRef.update({
        adminApproved: !userSnapshot.data().adminApproved
    });
    res.redirect('/admin/getbuyers');
    return;
});


app.post('/buyer/addreview', async (req, res) => {
    if (!req.session.isLoggedIn){
        res.render("401", {
            title: "Unauthorized",
            isLoggedIn: req.session.isLoggedIn,
            isSeller: req.session.isSeller,
            userName: req.session.userName,
            isAdmin: req.session.isAdmin,
            userId: req.session.userId
        });
        return;
    }
    console.log(req.body);
    const productId = req.body.productId;
    const rating = parseInt(req.body.rating);
    const review = req.body.review;
    const userId = req.session.userId;


    const reviewData = {
        productId: productId,
        userId: userId,
        rating: rating,
        review: review
    };

    const reviewRef = await createDocument('reviews', reviewData);
    if (reviewRef){
        res.status(200).send("Review added successfully");
        return;
    }
    res.send("Error adding review");
    
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