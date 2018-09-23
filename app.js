const express = require('express')
const bodyParser = require('body-parser')
const ejs = require('ejs')
const app = express()

const filePath = './utxoinfo.txt';
const mnemonic = 'direct replace bean north solve swap ranch field rug scout great kingdom';
const originalAmount = 81605;
const txid = '8ab66d1558407d8a7a307362edbdb414970af4e8857b6d4ef89277e15bac4236';
const vout = 9;

app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

app.engine('ejs', ejs.renderFile)

app.get('/', (request, response) => {
  response.render('index.ejs')
})

app.get('/create', (request, response) => {
  response.render('create.ejs')
})

app.post('/api/challenge', (request, response) => {
  console.log(request.body);
  challenge(response, request.body.answer, request.body.address);
})

app.post('/api/create', (request, response) => {
  console.log(request.body);
  create(response, request.body.answer, Number(request.body.value), Number(request.body.num));
})

app.listen(3000)

function challenge (response, answer, cashAddress) {
	let fs = require('fs');
	let fileData = fs.readFileSync(filePath, 'utf8');
	let fileDataArr = fileData.split(/\n/);

	let txid = (fileDataArr[0]);
	let originalAmount = Number(fileDataArr[1]);
	let vout = Number(fileDataArr[2]);

	let BITBOXCli = require('bitbox-cli/lib/bitbox-cli').default;

	const BITBOX = new BITBOXCli({
	  restURL: 'https://trest.bitcoin.com/v1/'
	})

	let stringHash = BITBOX.Crypto.hash160(answer + vout);

	console.log(stringHash);

	let doubleHash = BITBOX.Crypto.hash160(stringHash);

	console.log(doubleHash);

	// root seed buffer
	let rootSeed = BITBOX.Mnemonic.toSeed(mnemonic);

	// master HDNode
	let masterHDNode = BITBOX.HDNode.fromSeed(rootSeed, 'testnet');

	// HDNode of BIP44 account
	let account = BITBOX.HDNode.derivePath(masterHDNode, "m/44'/145'/0'");

	// derive the HDNode
	let node = BITBOX.HDNode.derivePath(account, '432/123');

	// create instance of Transaction Builder class
	let transactionBuilder = new BITBOX.TransactionBuilder('testnet');

	// add input
	transactionBuilder.addInput(txid, vout);

	// set fee and send amount
	let fee = 250;
	let sendAmount = originalAmount - fee;

	// add output
	transactionBuilder.addOutput(cashAddress, sendAmount);

	let script = [
	    BITBOX.Script.opcodes.OP_HASH160,
	    Buffer.from(doubleHash),
	    BITBOX.Script.opcodes.OP_EQUAL
	];

	// encode locking script
	let encodedScript = BITBOX.Script.encode(script);

	// HDNode to keypair
	let keyPair = BITBOX.HDNode.toKeyPair(node);

	// set hash type
	let hashType = 0xc1;

	// call buildIncomplete
	let tx = transactionBuilder.transaction.buildIncomplete()

	// create sighash
	let sigHash = tx.hashForWitnessV0(0, encodedScript, originalAmount, hashType)

	// create hostSig
	let hostSig = keyPair.sign(sigHash).toScriptSignature(hashType)

	// create unlocking script
	let script2 = [
	  Buffer.from(stringHash),
	  encodedScript.length
	];

	// concat scripts together
	let children = script2.concat(script);

	// encode scripts
	let encodedScript2 = BITBOX.Script.encode(children);

	// set input script
	tx.setInputScript(0, encodedScript2)

	// to hex
	let hex = tx.toHex()
	console.log(hex)


	let voutMax = vout - 1;

	// POST to BCH network
	BITBOX.RawTransactions.sendRawTransaction(hex).then((result) => { console.log(result);

	   // 成功した場合に、txtの残りデポジットNo.を書き換える処理
	   let fs = require('fs');
	   fs.writeFileSync(filePath, txid + '\n' + originalAmount + '\n' + voutMax);
       response.json({
           message: 'ok'
       });

    },(err) => {
      response.json({
        message: 'ng'
      });
    });

}


function create (response, answer, prize, totalOutputNumber) {
	let BITBOXCli = require('bitbox-cli/lib/bitbox-cli').default;
	const BITBOX = new BITBOXCli({
	  restURL: 'https://trest.bitcoin.com/v1/'
	})

	// root seed buffer
	let rootSeed = BITBOX.Mnemonic.toSeed(mnemonic);

	// master HDNode
	let masterHDNode = BITBOX.HDNode.fromSeed(rootSeed, 'testnet');

	// HDNode of BIP44 account
	let account = BITBOX.HDNode.derivePath(masterHDNode, "m/44'/145'/0'");

	// derive HDNode
	let node = BITBOX.HDNode.derivePath(account, '432/123');

	// HDNode to cashAddress
	let cashAddress = BITBOX.HDNode.toCashAddress(node);
	console.log(cashAddress);

	// create instance of Transaction Builder class
	let transactionBuilder = new BITBOX.TransactionBuilder('testnet');

	// add input
	transactionBuilder.addInput(txid, vout);

	// set fee
	let fee = 1000;

	// ユーザが受け取るときの手数料を上乗せしておく
	let acceptFee = 250;

	// P2SHでロックしておく金額(ユーザ賞金額 + ユーザが受け取るときの手数料)
	let sendAmount = prize + acceptFee;
	console.log(prize);
	console.log(acceptFee);
	console.log(prize + acceptFee);
	console.log(sendAmount);

	// お釣り計算
	let change = originalAmount - ( sendAmount * totalOutputNumber ) - fee;
	console.log(change);

	for (let i = 0; i < totalOutputNumber; i++) {
	  let stringHash = BITBOX.Crypto.hash160(answer + i);
	  let doubleHash = BITBOX.Crypto.hash160(stringHash);

	  console.log(stringHash);

	  let script = BITBOX.Script.encode([
	    BITBOX.Script.opcodes.OP_HASH160,
	    Buffer.from(doubleHash),
	    BITBOX.Script.opcodes.OP_EQUAL
	  ]);

	  // hash160 script buffer
	  let p2sh_hash160 = BITBOX.Crypto.hash160(script)

	  // encode hash160 as P2SH output
	  let scriptPubKey = BITBOX.Script.scriptHash.output.encode(p2sh_hash160)

	  // derive address from P2SH output
	  let address = BITBOX.Address.fromOutputScript(scriptPubKey ,'testnet')
	  console.log(address)

	  // add output
	  transactionBuilder.addOutput(address, sendAmount);
	}

	transactionBuilder.addOutput(cashAddress, change);

	// HDNode to keypair
	let key = BITBOX.HDNode.toKeyPair(node);

	// empty redeemScript var
	let redeemScript

	// sign input
	transactionBuilder.sign(0, key, redeemScript, transactionBuilder.hashTypes.SIGHASH_ALL, originalAmount)

	// build to hex
	let hex = transactionBuilder.build().toHex()

	// POST to BCH network
	BITBOX.RawTransactions.sendRawTransaction(hex).then((result) => {

	  let fs = require('fs');
	  fs.writeFileSync(filePath, result + '\n' + sendAmount + '\n' + totalOutputNumber -1);

      console.log(result);

      response.json({
        message: 'ok'
      });
    },(err) => {
      response.json({
        message: 'ng'
      });
    });
}
