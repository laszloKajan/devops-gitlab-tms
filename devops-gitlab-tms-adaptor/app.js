var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var v2NodesRouter = require('./routes/v2-nodes');
var v2RoutesRouter = require('./routes/v2-routes');
var v2ActionsRouter = require('./routes/v2-actions');
var versionsRouter = require('./routes/versions');
// API: https://api.sap.com/api/TMS_v2/resource

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/v2/nodes', v2NodesRouter);
app.use('/v2/routes', v2RoutesRouter);
app.use('/v2/actions', v2ActionsRouter);
app.use('/versions', versionsRouter);

module.exports = app;
