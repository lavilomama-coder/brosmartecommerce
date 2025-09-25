// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const mongoURI = 'mongodb+srv://lavilomama:lavilomama@cluster0.3vszla0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(mongoURI)
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const productSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: String,
    price: Number,
    stock: Number,
    description: String,
    longDescription: String,
    image: String,
    specialCoupon: String
});

const orderSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    tracking: String,
    createdAt: { type: Date, default: Date.now },
    items: [{
        productId: String,
        title: String,
        qty: Number,
        price: Number
    }],
    subtotal: Number,
    discount: Number,
    total: Number,
    coupon: String,
    paymentMethod: String,
    customer: {
        name: String,
        email: String, // Updated
        phone: String,
        address: String
    },
    status: { type: String, default: 'pending' }
});

const couponSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    code: String,
    type: String,
    value: Number,
    description: String
});

const slideSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: String,
    subtitle: String,
    image: String
});

const featureSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    icon: String,
    title: String,
    subtitle: String
});

const contentSchema = new mongoose.Schema({
    id: String,
    footerAbout: String,
    copyright: String
});

const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);
const Coupon = mongoose.model('Coupon', couponSchema);
const Slide = mongoose.model('Slide', slideSchema);
const Feature = mongoose.model('Feature', featureSchema);
const Content = mongoose.model('Content', contentSchema);

async function injectSampleData() {
    const productsCount = await Product.countDocuments();
    if (productsCount === 0) {
        const sampleProducts = [
            { id: "P1", title: "Classic White Shirt", price: 1999, stock: 12, description: "Premium cotton shirt.", image: "https://picsum.photos/seed/shirt/800/600", longDescription: "Experience pure comfort with our Classic White Shirt. Made from 100% premium, breathable cotton, it features a modern cut and durable stitching. Perfect for office wear or a casual weekend look.", specialCoupon: 'SHIRT50' },
            { id: "P2", title: "Slim Denim Jeans", price: 2999, stock: 8, description: "Comfort stretch denim.", image: "https://picsum.photos/seed/jeans/800/600", longDescription: "Our Slim Denim Jeans offer the perfect blend of style and comfort. With added stretch, they move with you, ensuring a great fit all day long. Features five pockets and a classic zip fly.", specialCoupon: null },
            { id: "P3", title: "Running Sneakers", price: 3999, stock: 6, description: "Lightweight running shoes.", image: "https://picsum.photos/seed/shoes/800/600", longDescription: "Hit the road with confidence. These Running Sneakers are designed for performance, featuring a lightweight, breathable mesh upper and a shock-absorbing sole. Maximum comfort for your daily run.", specialCoupon: null },
            { id: "P4", title: "Casual Hoodie", price: 2499, stock: 15, description: "Warm and stylish.", image: "https://picsum.photos/seed/hoodie/800/600", longDescription: "The ultimate casual staple. Our Casual Hoodie is soft, warm, and perfect for layering. Features a large front pocket and adjustable drawstring hood. Available in multiple colors.", specialCoupon: 'HOODIE10' },
        ];
        await Product.insertMany(sampleProducts);
        console.log('Sample products injected.');
    }
    const couponsCount = await Coupon.countDocuments();
    if (couponsCount === 0) {
        const sampleCoupons = [
            { id: 'C1', code: 'WELCOME10', type: 'percent', value: 10, description: '10% off new customers' },
            { id: 'C2', code: 'FLAT200', type: 'fixed', value: 200, description: '৳200 off' },
        ];
        await Coupon.insertMany(sampleCoupons);
        console.log('Sample coupons injected.');
    }
    const slidesCount = await Slide.countDocuments();
    if (slidesCount === 0) {
        const sampleSlides = [
            { id: 'S1', title: 'Autumn Collection', subtitle: 'Premium fabrics', image: 'https://picsum.photos/seed/hero1/1400/500' },
            { id: 'S2', title: 'Running Gear', subtitle: 'Lightweight & breathable', image: 'https://picsum.photos/seed/hero2/1400/500' },
        ];
        await Slide.insertMany(sampleSlides);
        console.log('Sample slides injected.');
    }
    const featuresCount = await Feature.countDocuments();
    if (featuresCount === 0) {
        const defaultFeatures = [
            { id: 'F1', icon: 'fa-truck-fast', title: 'Free Shipping', subtitle: 'On all orders above ৳5000' },
            { id: 'F2', icon: 'fa-handshake', title: 'Cash on Delivery', subtitle: 'Pay with cash at your door' },
            { id: 'F3', icon: 'fa-star', title: 'Best Quality Products', subtitle: 'Hand-picked premium wear' },
        ];
        await Feature.insertMany(defaultFeatures);
        console.log('Sample features injected.');
    }
    const contentCount = await Content.countDocuments();
    if (contentCount === 0) {
        const defaultContent = {
            id: 'site_content',
            footerAbout: 'Your one-stop destination for quality products at unbeatable prices. We offer a seamless shopping experience and quick delivery.',
            copyright: '© 2025 BrosMart. All rights reserved.'
        };
        await Content.create(defaultContent);
        console.log('Sample content injected.');
    }
}
injectSampleData();

app.get('/api/data', async (req, res) => {
    try {
        const [products, orders, coupons, slides, features, content] = await Promise.all([
            Product.find(),
            Order.find().sort({ createdAt: -1 }),
            Coupon.find(),
            Slide.find(),
            Feature.find(),
            Content.findOne() || {}
        ]);
        res.json({ products, orders, coupons, slides, features, content });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching data', error: err.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const newProduct = new Product({ ...req.body, id: `P${Math.random().toString(36).slice(2, 9).toUpperCase()}` });
        await newProduct.save();
        res.status(201).json(newProduct);
    } catch (err) {
        res.status(400).json({ message: 'Error adding product', error: err.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const updatedProduct = await Product.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
        res.json(updatedProduct);
    } catch (err) {
        res.status(400).json({ message: 'Error updating product', error: err.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await Product.deleteOne({ id: req.params.id });
        res.json({ message: 'Product deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting product', error: err.message });
    }
});

app.post('/api/orders', async (req, res) => {
    const { items, customer, coupon } = req.body;
    try {
        const productUpdates = items.map(item =>
            Product.findOneAndUpdate(
                { id: item.productId, stock: { $gte: item.qty } },
                { $inc: { stock: -item.qty } }
            )
        );
        const results = await Promise.all(productUpdates);
        if (results.some(result => !result)) {
            return res.status(400).json({ message: 'One or more items are out of stock.' });
        }
        const order = new Order({
            id: `O_${Date.now()}`,
            tracking: `BROS-${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, '0')}${new Date().getDate().toString().padStart(2, '0')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            items,
            subtotal: items.reduce((s, i) => s + i.price * i.qty, 0),
            discount: req.body.discount,
            total: req.body.total,
            coupon,
            customer,
            paymentMethod: 'Cash on Delivery',
            status: 'pending'
        });
        await order.save();
        res.status(201).json(order);
    } catch (err) {
        res.status(500).json({ message: 'Failed to place order', error: err.message });
    }
});

app.put('/api/orders/:id/shipped', async (req, res) => {
    try {
        const order = await Order.findOneAndUpdate({ id: req.params.id }, { status: 'shipped' }, { new: true });
        res.json(order);
    } catch (err) {
        res.status(500).json({ message: 'Error updating order status', error: err.message });
    }
});

app.post('/api/coupons', async (req, res) => {
    try {
        const newCoupon = new Coupon({ ...req.body, id: `C${Math.random().toString(36).slice(2, 9).toUpperCase()}` });
        await newCoupon.save();
        res.status(201).json(newCoupon);
    } catch (err) {
        res.status(400).json({ message: 'Error creating coupon', error: err.message });
    }
});

app.delete('/api/coupons/:id', async (req, res) => {
    try {
        await Coupon.deleteOne({ id: req.params.id });
        res.json({ message: 'Coupon deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting coupon', error: err.message });
    }
});

app.post('/api/slides', async (req, res) => {
    try {
        const newSlide = new Slide({ ...req.body, id: `S${Math.random().toString(36).slice(2, 9).toUpperCase()}` });
        await newSlide.save();
        res.status(201).json(newSlide);
    } catch (err) {
        res.status(400).json({ message: 'Error adding slide', error: err.message });
    }
});

app.delete('/api/slides/:id', async (req, res) => {
    try {
        await Slide.deleteOne({ id: req.params.id });
        res.json({ message: 'Slide deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting slide', error: err.message });
    }
});

app.put('/api/content', async (req, res) => {
    try {
        const updatedContent = await Content.findOneAndUpdate({ id: 'site_content' }, req.body, { new: true, upsert: true });
        res.json(updatedContent);
    } catch (err) {
        res.status(400).json({ message: 'Error updating content', error: err.message });
    }
});

app.post('/api/features', async (req, res) => {
    try {
        const newFeature = new Feature({ ...req.body, id: `F${Math.random().toString(36).slice(2, 9).toUpperCase()}` });
        await newFeature.save();
        res.status(201).json(newFeature);
    } catch (err) {
        res.status(400).json({ message: 'Error adding feature', error: err.message });
    }
});

app.put('/api/features/:id', async (req, res) => {
    try {
        const updatedFeature = await Feature.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
        res.json(updatedFeature);
    } catch (err) {
        res.status(400).json({ message: 'Error updating feature', error: err.message });
    }
});

app.delete('/api/features/:id', async (req, res) => {
    try {
        await Feature.deleteOne({ id: req.params.id });
        res.json({ message: 'Feature deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting feature', error: err.message });
    }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
