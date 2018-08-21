'use strict'

/* eslint new-cap: ["error", { "properties": false }] */

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck')

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2)

var _createClass2 = require('babel-runtime/helpers/createClass')

var _createClass3 = _interopRequireDefault(_createClass2)

var _promise = require('babel-runtime/core-js/promise')

var _promise2 = _interopRequireDefault(_promise)

var _sha = require('sha.js')

function _interopRequireDefault (obj) { return obj && obj.__esModule ? obj : { default: obj } }

/********************************************************************************
 *   Ledger Node JS API
 *   (c) 2017-2018 Ledger
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 ********************************************************************************/
var CLA = 0xe0
var INS_GET_PK = 0x02
var INS_SIGN_TX = 0x04
var INS_GET_CONF = 0x06
var INS_SIGN_TX_HASH = 0x08
var INS_KEEP_ALIVE = 0x10

var APDU_MAX_SIZE = 150
var P1_FIRST_APDU = 0x00
var P1_MORE_APDU = 0x80
var P2_LAST_APDU = 0x00
var P2_MORE_APDU = 0x80

var SW_OK = 0x9000
var SW_CANCEL = 0x6985
var SW_UNKNOWN_OP = 0x6c24
var SW_MULTI_OP = 0x6c25
var SW_NOT_ALLOWED = 0x6c66
var SW_UNSUPPORTED = 0x6d00
var SW_KEEP_ALIVE = 0x6e02

var TX_MAX_SIZE = 1540

/**
 * EosLedger API
 *
 * @example
 * import EosLedger from "@ledgerhq/hw-app-eos";
 * const eosLedger = new EosLedger(transport)
 */
function hash (data) {
  var hasher = new _sha.sha256()
  hasher.update(data, 'utf8')
  return hasher.digest()
}

var EosLedger = (function () {
  function EosLedger (transport) {
    (0, _classCallCheck3.default)(this, EosLedger)

    this.transport = transport
    transport.decorateAppAPIMethods(this, ['getAppConfiguration', 'getPublicKey', 'signTransaction', 'signHash'], 'l0v')
  }

  (0, _createClass3.default)(EosLedger, [{
    key: 'getAppConfiguration',
    value: function getAppConfiguration () {
      return this.transport.send(CLA, INS_GET_CONF, 0x00, 0x00).then(function (response) {
        var multiOpsEnabled = response[0] === 0x01 || response[1] < 0x02
        var version = '' + response[1] + '.' + response[2] + '.' + response[3]
        return {
          version: version,
          multiOpsEnabled: multiOpsEnabled
        }
      })
    }

    /**
     * get EosLedger public key for a given BIP 32 path.
     * @param path a path in BIP 32 format
     * @option boolValidate optionally enable key pair validation
     * @option boolDisplay optionally enable or not the display
     * @return an object with the publicKey
     * @example
     * eosLedger.getPublicKey("44'/60'/0'").then(o => o.publicKey)
     */

  }, {
    key: 'getPublicKey',
    value: function getPublicKey (path, boolValidate, boolDisplay) {
      var _this = this;

      (0, checkEosBip32Path)(path)

      var apdus = []
      var response = void 0

      var pathElts = (0, splitPath)(path)
      var buffer = Buffer.alloc(1 + pathElts.length * 4)
      buffer[0] = pathElts.length
      pathElts.forEach(function (element, index) {
        buffer.writeUInt32BE(element, 1 + 4 * index)
      })
      apdus.push(buffer)
      var keepAlive = false
      return (0, foreach)(apdus, function (data) {
        return _this.transport.send(CLA, keepAlive ? INS_KEEP_ALIVE : INS_GET_PK, boolValidate ? 0x01 : 0x00, boolDisplay ? 0x01 : 0x00, data, [SW_OK, SW_KEEP_ALIVE]).then(function (apduResponse) {
          var status = Buffer.from(apduResponse.slice(apduResponse.length - 2)).readUInt16BE(0)
          if (status === SW_KEEP_ALIVE) {
            keepAlive = true
            apdus.push(Buffer.alloc(0))
          }
          response = apduResponse
        })
      }).then(function () {
        // response = Buffer.from(response, 'hex');
        var offset = 0
        var publicKey = response.slice(offset, offset + 50)
        return {
          publicKey: publicKey
        }
      })
    }

    /**
     * sign a EosLedger transaction.
     * @param path a path in BIP 32 format
     * @param transaction signature base of the transaction to sign
     * @return an object with the signature and the status
     * @example
     * eosLedger.signTransaction("44'/60'/0'", signatureBase).then(o => o.signature)
     */

  }, {
    key: 'signTransaction',
    value: function signTransaction (path, transaction) {
      var _this2 = this;

      (0, checkEosBip32Path)(path)

      if (transaction.length > TX_MAX_SIZE) {
        throw new Error('Transaction too large: max = ' + TX_MAX_SIZE + '; actual = ' + transaction.length)
      }

      var apdus = []
      var response = void 0

      var pathElts = (0, splitPath)(path)
      var bufferSize = 1 + pathElts.length * 4
      var buffer = Buffer.alloc(bufferSize)
      buffer[0] = pathElts.length
      pathElts.forEach(function (element, index) {
        buffer.writeUInt32BE(element, 1 + 4 * index)
      })
      var chunkSize = APDU_MAX_SIZE - bufferSize
      if (transaction.length <= chunkSize) {
        // it fits in a single apdu
        apdus.push(Buffer.concat([buffer, transaction]))
      }
      else {
        // we need to send multiple apdus to transmit the entire transaction
        var chunk = Buffer.alloc(chunkSize)
        var offset = 0
        transaction.copy(chunk, 0, offset, chunkSize)
        apdus.push(Buffer.concat([buffer, chunk]))
        offset += chunkSize
        while (offset < transaction.length) {
          var remaining = transaction.length - offset
          chunkSize = remaining < APDU_MAX_SIZE ? remaining : APDU_MAX_SIZE
          chunk = Buffer.alloc(chunkSize)
          transaction.copy(chunk, 0, offset, offset + chunkSize)
          offset += chunkSize
          apdus.push(chunk)
        }
      }
      var keepAlive = false
      return (0, foreach)(apdus, function (data, i) {
        return _this2.transport.send(CLA, keepAlive ? INS_KEEP_ALIVE : INS_SIGN_TX, i === 0 ? P1_FIRST_APDU : P1_MORE_APDU, i === apdus.length - 1 ? P2_LAST_APDU : P2_MORE_APDU, data, [SW_OK, SW_CANCEL, SW_UNKNOWN_OP, SW_MULTI_OP, SW_KEEP_ALIVE]).then(function (apduResponse) {
          var status = Buffer.from(apduResponse.slice(apduResponse.length - 2)).readUInt16BE(0)
          if (status === SW_KEEP_ALIVE) {
            keepAlive = true
            apdus.push(Buffer.alloc(0))
          }
          response = apduResponse
        })
      }).then(function () {
        var status = Buffer.from(response.slice(response.length - 2)).readUInt16BE(0)
        if (status === SW_OK) {
          var _signature2 = Buffer.from(response.slice(0, response.length - 2))
          return {
            signature: _signature2
          }
        }
        else if (status === SW_UNKNOWN_OP) {
          return _this2.signHashPrivate(path, (0, hash)(transaction))
        }
        else if (status === SW_MULTI_OP) {
          // multi-operation transaction: attempt hash signing
          return _this2.signHashPrivate(path, (0, hash)(transaction))
        }
        else {
          throw new Error('Transaction approval request was rejected')
        }
      })
    }

    /**
     * sign a EosLedger transaction hash.
     * @param path a path in BIP 32 format
     * @param hash hash of the transaction to sign
     * @return an object with the signature
     * @example
     * eosLedger.signHash("44'/60'/0'", hash).then(o => o.signature)
     */

  }, {
    key: 'signHash',
    value: function signHash (path, hash) {
      (0, checkEosBip32Path)(path)
      return this.signHashPrivate(path, hash)
    }
  }, {
    key: 'signHashPrivate',
    value: function signHashPrivate (path, hash) {
      var _this3 = this

      var apdus = []
      var response = void 0

      var pathElts = (0, splitPath)(path)
      var buffer = Buffer.alloc(1 + pathElts.length * 4)
      buffer[0] = pathElts.length
      pathElts.forEach(function (element, index) {
        buffer.writeUInt32BE(element, 1 + 4 * index)
      })
      apdus.push(Buffer.concat([buffer, hash]))
      var keepAlive = false
      return (0, foreach)(apdus, function (data) {
        return _this3.transport.send(CLA, keepAlive ? INS_KEEP_ALIVE : INS_SIGN_TX_HASH, 0x00, 0x00, data, [SW_OK, SW_CANCEL, SW_NOT_ALLOWED, SW_UNSUPPORTED, SW_KEEP_ALIVE]).then(function (apduResponse) {
          var status = Buffer.from(apduResponse.slice(apduResponse.length - 2)).readUInt16BE(0)
          if (status === SW_KEEP_ALIVE) {
            keepAlive = true
            apdus.push(Buffer.alloc(0))
          }
          response = apduResponse
        })
      }).then(function () {
        var status = Buffer.from(response.slice(response.length - 2)).readUInt16BE(0)
        if (status === SW_OK) {
          var _signature3 = Buffer.from(response.slice(0, response.length - 2))
          return {
            signature: _signature3
          }
        }
        else if (status === SW_CANCEL) {
          throw new Error('Transaction approval request was rejected')
        }
        else if (status === SW_UNSUPPORTED) {
          throw new Error('Hash signing is not supported')
        }
        else {
          throw new Error('Hash signing not allowed. Have you enabled it in the app settings?')
        }
      })
    }
  }])
  return EosLedger
}())

// // TODO use bip32-path library
function splitPath (path) {
  var result = []
  var components = path.split('/')
  components.forEach(function (element) {
    var number = parseInt(element, 10)
    if (isNaN(number)) {
      return // FIXME shouldn't it throws instead?
    }
    if (element.length > 1 && element[element.length - 1] === "'") {
      number += 0x80000000
    }
    result.push(number)
  })
  return result
} /********************************************************************************
 *   Ledger Node JS API
 *   (c) 2017-2018 Ledger
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 ********************************************************************************/
function foreach (arr, callback) {
  function iterate (index, array, result) {
    if (index >= array.length) {
      return result
    }
    else {
      return callback(array[index], index).then(function (res) {
        result.push(res)
        return iterate(index + 1, array, result)
      })
    }
  }
  return _promise2.default.resolve().then(function () {
    return iterate(0, arr, [])
  })
}
function checkEosBip32Path (path) {
  path.split('/').forEach(function (element) {
    if (!element.toString().endsWith("'")) {
      throw new Error('Detected a non-hardened path element in requested BIP32 path.' + ' Non-hardended paths are not supported at this time. Please use an all-hardened path.' + " Example: 44'/60'/0'")
    }
  })
}

export default EosLedger

// exports = EosLedger;
// # sourceMappingURL=EosLedger.js.map
