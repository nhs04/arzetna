document.addEventListener('DOMContentLoaded', () => {
    fetchProducts();
    fetchCart();
});

function fetchProducts() {
    fetch('http://localhost:3000/products')
        .then(response => response.json())
        .then(products => displayProducts(products))
        .catch(error => console.error('Error fetching products:', error));
}

function displayProducts(products) {
    const productsElement = document.getElementById('products');
    productsElement.innerHTML = '';
    products.forEach(product => {
        const productElement = document.createElement('div');
        productElement.className = 'product';
        const mainImage = product.images[0];
        let imagesHTML = '';
        if (product.images.length > 1) {
            imagesHTML = `<div class="swiper-container">
                            <div class="swiper-wrapper">
                                ${product.images.map(image => `<div class="swiper-slide"><img src="${image}" alt="${product.name}" style="width:auto;height:200px;"></div>`).join('')}
                            </div>
                            <div class="swiper-pagination"></div>
                          </div>`;
        } else {
            imagesHTML = `<img src="${mainImage}" alt="${product.name}" style="width:auto;height:200px;">`;
        }

        productElement.innerHTML = `
            <div class="product-image">${imagesHTML}</div>
            <h3>${product.name}</h3>
            <p>${product.description}</p>
            <p>Company: ${product.company}</p>
            <p>$${product.price}</p>
            <button class="button" onclick="addToCart(${product.id}, 1)">Add to Cart</button>
        `;
        productsElement.appendChild(productElement);
    });
    initializeSwipers(); // This will initialize swipers for all products after they're displayed
}

function initializeSwipers() {
    document.querySelectorAll('.swiper-container').forEach(element => {
        new Swiper(element, {
            loop: true,
            pagination: {
                el: '.swiper-pagination',
                clickable: true,
            },
        });
    });
}

function addToCart(productId, quantity) {
    fetch('http://localhost:3000/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity })
    })
    .then(response => response.json())
    .then(() => fetchCart())
    .catch(error => console.error('Error adding to cart:', error));
}

function fetchCart() {
    fetch('http://localhost:3000/cart')
        .then(response => response.json())
        .then(cart => displayCart(cart))
        .catch(error => console.error('Error fetching cart:', error));
}

function displayCart(cart) {
    const cartElement = document.getElementById('cart');
    cartElement.innerHTML = '';
    cart.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'cart-item';
        itemElement.innerHTML = `
            <h4>${item.name}</h4>
            <p>Price: $${item.price}</p>
            <p>Quantity: <button onclick="updateQuantity(${item.id}, ${item.quantity - 1})">-</button> ${item.quantity} <button onclick="updateQuantity(${item.id}, ${item.quantity + 1})">+</button></p>
            <p>Total: $${item.price * item.quantity}</p>
            <button class="button" onclick="removeFromCart(${item.id})">Remove</button>
        `;
        cartElement.appendChild(itemElement);
    });
}

function updateQuantity(productId, newQuantity) {
    fetch(`http://localhost:3000/cart/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: newQuantity })
    })
    .then(response => response.json())
    .then(() => fetchCart())
    .catch(error => console.error('Error updating cart:', error));
}

function removeFromCart(productId) {
    fetch(`http://localhost:3000/cart/${productId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(() => fetchCart())
    .catch(error => console.error('Error removing from cart:', error));
}

function initializeSwipers() {
    new Swiper('.swiper-container', {
        loop: true,
        pagination: {
            el: '.swiper-pagination',
            clickable: true,
        },
        navigation: {
            nextEl: '.swiper-button-next',
            prevEl: '.swiper-button-prev',
        },
    });
}
