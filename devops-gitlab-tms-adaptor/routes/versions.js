var express = require('express');
var router = express.Router();

/* GET versions listing. */
router.get('/', function (req, res, next) {
    res.send({
        "supportedVersions": [
            {
                "version": "1",
                "path": "v1"
            },
            {
                "version": "2",
                "path": "v2"
            }
        ]
    });
});

module.exports = router;
