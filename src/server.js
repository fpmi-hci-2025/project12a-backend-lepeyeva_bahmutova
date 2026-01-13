const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 5000;
const API_VERSION = process.env.API_VERSION || 'v1';

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
        success: false,
        error: 'Too many requests, please try again later'
    }
});

app.use('/api', limiter);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

// Простые тестовые endpoints
app.get('/ping', (req, res) => {
    res.send('PONG! Server is working!');
});

app.get('/test', (req, res) => {
    res.json({ 
        success: true,
        message: 'Server is reachable!',
        timestamp: new Date().toISOString(),
        yourIP: req.ip || req.connection.remoteAddress
    });
});

// API routes
app.use(`/api/${API_VERSION}`, routes);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'TaskFlow API',
        version: API_VERSION,
        status: 'running',
        endpoints: {
            health: `/api/${API_VERSION}/health`,
            docs: '/api-docs',
            test: '/test',
            ping: '/ping'
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);

    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Start server
// ✅ ВАЖНО: Используем 0.0.0.0 чтобы слушать на всех интерфейсах
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log('=================================');
    console.log(`🚀 TaskFlow API Server`);
    console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Server running on ${HOST}:${PORT}`);
    console.log(`📍 Local: http://localhost:${PORT}`);
    console.log(`📱 Network: http://192.168.0.169:${PORT}`);
    console.log(`🧪 Test endpoints:`);
    console.log(`   • http://192.168.0.169:${PORT}/ping`);
    console.log(`   • http://192.168.0.169:${PORT}/test`);
    console.log(`   • http://192.168.0.169:${PORT}/api/${API_VERSION}/health`);
    console.log('=================================');
});

module.exports = app;