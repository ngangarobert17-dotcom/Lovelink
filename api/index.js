// LoveLink API entrypoint: auth, plans, paypal, payouts, creator, admin
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const plansRouter = require('./routes/plans');
const paypalRouter = require('./routes/paypal');
const authRouter = require('./routes/auth');

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use('/api/auth', authRouter);
app.use('/api/plans', plansRouter);
app.use('/api/paypal', paypalRouter);
app.use('/api/payouts', require('./routes/payouts'));
app.use('/api/creator', require('./routes/creator'));
app.use('/api/admin', require('./routes/admin'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`LoveLink API running on http://localhost:${PORT}`);
});
