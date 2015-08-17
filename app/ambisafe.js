/**
 * Copyright (c) 2015 Ambisafe Inc.
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including the rights to use, copy, modify,
 * merge, publish, distribute, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/**
 * @file ambisafe.js
 * Ambisafe class used to define the functions of the library
 * @author Charlie Fontana <charlie@ambisafe.co>
 * @date 07/13/2015
 */

/**
 * This section defines the required libraries
 */
var bitcoin = require('bitcoinjs-lib'),
	pbkdf2 = require('crypto-PBKDF2'),
	crypto = require('crypto'),
	BigInteger = require('bigi'),
	uuid4 = require('uuid4');

/**
 * Defines the Ambisafe constructor.
 */
var Ambisafe = function () {

};

/**
 * Defines the static constants
 */
Ambisafe.currency = {};
Ambisafe.currency.BITCOIN = 'BTC';

/**
 * Defines the Ambisafe.Account class based on the ./account/account.js file.
 * Defines the Ambisafe.QRScanner class based on the ./qrscanner/qrscanner.js file.
 */
Ambisafe.Account = require('./account/account.js');
Ambisafe.QRScanner = require('./qrscanner/qrscanner.js');

/**
 * Static method that creates an account and save it. 
 * This supposed to happen after user have filled registration form and clicked submit.
 *
 * @param {string} currency as string
 * @param {string} password as string
 * @param {string} salt as string
 * @return {Ambisafe.Account} return the generated account object
 */
Ambisafe.generateAccount = function(currency, password, salt) {
	var account, key, eckey, iv;

	if (!currency || !password) {
		console.log('ERR: currency and password are required');
		return;
	}

	if (!salt) {
		salt = uuid4();
	}

	key = Ambisafe.deriveKey(password, salt);

	account = new Ambisafe.Account();
	account.set('key', key);
	account.set('salt', salt);

	if (currency) {
		account.set('currency', currency);
	}

	eckey = bitcoin.ECKey.makeRandom();
	account.set('privateKey', eckey.d.toHex());
	account.set('publicKey', eckey.pub.toHex());
	iv = Ambisafe.generateRandomValue(16);
	account.set('iv', iv);

	account.set('data', Ambisafe.encrypt(
		account.get('privateKey'),
		iv, 
		key)
	);

	return account;
};

/**
 * Static method that signs a transaction.
 *
 * @param {object} unsigned transaction: {hex:'...', fee:'...', sighashes:['...', '...']}.
 * @param {string} private key.
 * @return {object} signed transaction.
 */
Ambisafe.signTransaction = function (tx, privateKey) {
	var keyPair, sign, buffer, d;

	if (!(tx.sighashes) || !(tx.sighashes instanceof Array)) {
		console.log('ERR: The "sighashes" attribute is required.');
		return;
	}

	tx.user_signatures = [];
	buffer = new Buffer(privateKey, 'hex');
	d = BigInteger.fromBuffer(buffer);
	keyPair = new bitcoin.ECKey(d, true);

	tx.sighashes.forEach(function(sighash) {
		sign = keyPair.sign(new Buffer(sighash, 'hex')).toDER().toString('hex');
		tx.user_signatures.push(sign);
	});

	return tx;
};

/**
 * Static method that grabs a new salt value.
 *
 * @param {number} explicitIterations An integer
 * @return {string} return iterations and salt together as one string ({hex-iterations}.{base64-salt})
 */
Ambisafe.generateSalt = function(explicitIterations) {
	var bytes, iterations;

	if (!explicitIterations) {
		explicitIterations = 1000;
	}

	bytes = pbkdf2.lib.WordArray.random(192/8);
	iterations = explicitIterations.toString(16);

	return iterations + '.' + bytes.toString(pbkdf2.enc.Base64);
};

/**
 * Static method that generates random values 
 *
 * @param {number} length An integer
 * @return {string} return random value 
 */
Ambisafe.generateRandomValue = function(length) {
	var randomBytes;

	if (!length) {
		length = 256/16;
	}

	randomBytes = crypto.randomBytes(Math.ceil(length));
	return randomBytes.toString('hex');
};

/**
 * Static method that derives a key from a password
 *
 * @param {string} password
 * @param {string} salt
 * @param {number} depth
 * @return {string} key
 */
Ambisafe.deriveKey = function(password, salt, depth) {
	var key;

	if (!depth) {
		depth = 1000;
	}

	key = pbkdf2.PBKDF2(
		password,
		salt,
		{ 'keySize': 256/64, 'iterations': depth }
	);

	return key.toString();
};

/**
 * Static method that encrypts an input based on the Advanced Encryption Standard (AES)
 *
 * @param {string} cleardata
 * @param {string} iv
 * @param {string} cryptkey
 * @return {string} encrypted data
 */
Ambisafe.encrypt = function(cleardata, iv, cryptkey) {
	var encipher, encryptData, encodeEncryptData, bufferCryptKey;

	bufferCryptKey = new Buffer(cryptkey);

	encipher = crypto.createCipheriv('aes-256-cbc', bufferCryptKey, new Buffer(iv, 'hex'));
	encryptData  = encipher.update(cleardata, 'utf8', 'binary');

	encryptData += encipher.final('binary');
	encodeEncryptData = new Buffer(encryptData, 'binary').toString('hex');

	return encodeEncryptData;
};

/**
 * Static method that decrypts an input based on the Advanced Encryption Standard (AES)
 *
 * @param {string} encryptdata
 * @param {string} iv 
 * @param {string} cryptkey
 * @return {string} decrypted text
 */
Ambisafe.decrypt = function(encryptdata, iv, cryptkey) {
	var decipher, decoded, bufferCryptKey;

	bufferCryptKey = new Buffer(cryptkey);

	encryptdata = new Buffer(encryptdata, 'hex').toString('binary');

	decipher = crypto.createDecipheriv('aes-256-cbc', bufferCryptKey, new Buffer(iv, 'hex'));
	decoded  = decipher.update(encryptdata, 'binary', 'utf8');

	decoded += decipher.final('utf8');

	return decoded;
};

/**
 * Static method that gets the SHA1 hash of a string
 *
 * @param {string} input
 * @return {string} SHA1 hash
 */
Ambisafe.SHA1 = function(input) {
	var shasum = crypto.createHash('sha1');

	shasum.update(input);

	return shasum.digest('hex');
};

/**
 * exports the created Ambisafe object.
 */
module.exports = Ambisafe;