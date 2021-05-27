const axios = require('axios');
var debug = require('debug')('devops-gitlab-tms-adaptor:routes-v2-actions');
var express = require('express');
var router = express.Router();

// GET /v2/actions/{actionId}
router.get('/:actionId(\\d+)', function (req, res, next) {
    res.send();
});

module.exports = router;
