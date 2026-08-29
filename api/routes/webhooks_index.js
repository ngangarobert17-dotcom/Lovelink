const express = require('express');
const router = express.Router();
const webhooks = require('./webhooks');

router.use('/email', webhooks);

module.exports = router;
