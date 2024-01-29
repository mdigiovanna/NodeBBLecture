'use strict';

const nconf = require('nconf');
const winston = require('winston');
const { createHash, createSign, createVerify } = require('crypto');

const request = require('../request');
const db = require('../database');
const user = require('../user');
const utils = require('../utils');
const ttl = require('../cache/ttl');

const requestCache = ttl({ ttl: 1000 * 60 * 5 }); // 5 minutes
const ActivityPub = module.exports;

ActivityPub._constants = Object.freeze({
	publicAddress: 'https://www.w3.org/ns/activitystreams#Public',
});

ActivityPub.helpers = require('./helpers');
ActivityPub.inbox = require('./inbox');
ActivityPub.mocks = require('./mocks');
ActivityPub.notes = require('./notes');
ActivityPub.actors = require('./actors');

ActivityPub.resolveInboxes = async (ids) => {
	const inboxes = new Set();

	await ActivityPub.actors.assert(ids);
	await Promise.all(ids.map(async (id) => {
		const { inbox, sharedInbox } = await user.getUserFields(id, ['inbox', 'sharedInbox']);
		if (sharedInbox || inbox) {
			inboxes.add(sharedInbox || inbox);
		}
	}));

	return Array.from(inboxes);
};

ActivityPub.getPublicKey = async (uid) => {
	let publicKey;

	try {
		({ publicKey } = await db.getObject(`uid:${uid}:keys`));
	} catch (e) {
		({ publicKey } = await ActivityPub.helpers.generateKeys(uid));
	}

	return publicKey;
};

ActivityPub.getPrivateKey = async (uid) => {
	let privateKey;

	try {
		({ privateKey } = await db.getObject(`uid:${uid}:keys`));
	} catch (e) {
		({ privateKey } = await ActivityPub.helpers.generateKeys(uid));
	}

	return privateKey;
};

ActivityPub.fetchPublicKey = async (uri) => {
	// Used for retrieving the public key from the passed-in keyId uri
	const { response, body } = await request.get(uri, {
		headers: {
			Accept: 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
		},
	});

	if (!String(response.statusCode).startsWith('2') || !body.hasOwnProperty('publicKey')) {
		throw new Error('[[error:activitypub.pubKey-not-found]]');
	}

	return body.publicKey;
};

ActivityPub.sign = async (uid, url, payload) => {
	// Sanity checking
	if (!utils.isNumber(uid) || parseInt(uid, 10) < 0) {
		throw new Error('[[error:invalid-uid]]');
	}
	uid = parseInt(uid, 10);

	// Returns string for use in 'Signature' header
	const { host, pathname } = new URL(url);
	const date = new Date().toUTCString();
	const key = await ActivityPub.getPrivateKey(uid);
	const keyId = `${nconf.get('url')}${uid > 0 ? `/uid/${uid}` : '/actor'}#key`;
	let digest = null;

	let headers = '(request-target) host date';
	let signed_string = `(request-target): ${payload ? 'post' : 'get'} ${pathname}\nhost: ${host}\ndate: ${date}`;

	// Calculate payload hash if payload present
	if (payload) {
		const payloadHash = createHash('sha256');
		payloadHash.update(JSON.stringify(payload));
		digest = `sha-256=${payloadHash.digest('base64')}`;
		headers += ' digest';
		signed_string += `\ndigest: ${digest}`;
	}

	// Sign string using private key
	let signature = createSign('sha256');
	signature.update(signed_string);
	signature.end();
	signature = signature.sign(key, 'base64');

	// Construct signature header
	return {
		date,
		digest,
		signature: `keyId="${keyId}",headers="${headers}",signature="${signature}"`,
	};
};

ActivityPub.verify = async (req) => {
	if (!req.headers.hasOwnProperty('signature')) {
		return false;
	}

	// Break the signature apart
	const { keyId, headers, signature } = req.headers.signature.split(',').reduce((memo, cur) => {
		const split = cur.split('="');
		const key = split.shift();
		const value = split.join('="');
		memo[key] = value.slice(0, -1);
		return memo;
	}, {});

	// Re-construct signature string
	const signed_string = headers.split(' ').reduce((memo, cur) => {
		if (cur === '(request-target)') {
			memo.push(`${cur}: ${String(req.method).toLowerCase()} ${req.baseUrl}${req.path}`);
		} else if (req.headers.hasOwnProperty(cur)) {
			memo.push(`${cur}: ${req.headers[cur]}`);
		}

		return memo;
	}, []).join('\n');

	// Verify the signature string via public key
	try {
		// Retrieve public key from remote instance
		const { publicKeyPem } = await ActivityPub.fetchPublicKey(keyId);

		const verify = createVerify('sha256');
		verify.update(signed_string);
		verify.end();
		const verified = verify.verify(publicKeyPem, signature, 'base64');
		return verified;
	} catch (e) {
		return false;
	}
};

ActivityPub.get = async (uid, uri) => {
	const cacheKey = [uid, uri].join(';');
	if (requestCache.has(cacheKey)) {
		return requestCache.get(cacheKey);
	}

	const headers = uid >= 0 ? await ActivityPub.sign(uid, uri) : {};
	winston.verbose(`[activitypub/get] ${uri}`);
	const { response, body } = await request.get(uri, {
		headers: {
			...headers,
			Accept: 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
		},
	});

	if (!String(response.statusCode).startsWith('2')) {
		winston.error(`[activitypub/get] Received ${response.statusCode} when querying ${uri}`);
		if (body.hasOwnProperty('error')) {
			winston.error(`[activitypub/get] Error received: ${body.error}`);
		}

		throw new Error(`[[error:activitypub.get-failed]]`);
	}

	requestCache.set(cacheKey, body);
	return body;
};

ActivityPub.send = async (uid, targets, payload) => {
	if (!Array.isArray(targets)) {
		targets = [targets];
	}

	const inboxes = await ActivityPub.resolveInboxes(targets);

	payload = {
		'@context': 'https://www.w3.org/ns/activitystreams',
		actor: `${nconf.get('url')}/uid/${uid}`,
		...payload,
	};

	await Promise.all(inboxes.map(async (uri) => {
		const headers = await ActivityPub.sign(uid, uri, payload);
		const { response } = await request.post(uri, {
			headers: {
				...headers,
				'content-type': 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
			},
			body: payload,
		});

		if (!String(response.statusCode).startsWith('2')) {
			// todo: i18n this
			throw new Error('activity-failed');
		}
	}));
};
