document.getElementById('productForm').addEventListener('submit', function(event) {
    event.preventDefault();

    // Get form data
    const productName = document.getElementById('productName').value.trim();
    const productDescription = document.getElementById('productDescription').value.trim();
    const productPrice = document.getElementById('productPrice').value.trim();
    const productImage = document.getElementById('productImage').value.trim();

    // Validate form fields
    if (!productName || !productDescription || !productPrice || !productImage) {
        alert('Please fill in all fields');
        return;
    }

    // Submit form data (You can send this data to your server using AJAX or fetch)
    console.log('Product Name:', productName);
    console.log('Description:', productDescription);
    console.log('Price:', productPrice);
    console.log('Image:', productImage);

    // Reset form
    this.reset();
});

