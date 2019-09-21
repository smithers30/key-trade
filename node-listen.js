const querystring = require('querystring');
const http = require('http');
const fs = require('fs');
const url = require('url');
const Mustache = require('Mustache');
const path = require('path');
const credentials = require('creds');

var stacheView = {},
	orderData = {},
	cacheBlocks = {};

fs.readdirSync(path.join(__dirname, '\\blocks\\')).forEach(function(fileName) {
	cacheBlocks[path.parse(fileName).name] = String(fs.readFileSync(path.join('blocks\\', fileName)));
});

function renderBlocks() {
	for (var block in cacheBlocks) {
		if (cacheBlocks.hasOwnProperty(block)) {
			stacheView[block] = Mustache.render(cacheBlocks[block], stacheView);
		}
	}
}

function int(num) {
	return parseInt(num);
}

function float(num) {
	return parseFloat(num);
}

var Robinhood = require('robinhood')(credentials, function() {
    Robinhood.accounts(function(err, response, body) {
    	var acct = body.results[0];

		stacheView.account_balance = acct.buying_power;
		stacheView.account_number = acct.account_number;
		stacheView.account_data = JSON.stringify(body);
    });

	http.createServer(function(req, res) {
		var parseURL = url.parse(req.url),
			parseQS = querystring.parse(parseURL.query),
			pathName = parseURL.pathname,
			fileName = path.parse(pathName).name,
			href = parseURL.href,
			orderID = String(parseQS.order_id);

		function writeRender(source) {
			stacheView[fileName] = 'active';
			renderBlocks();
			res.writeHead(200, {'Content-Type': 'text/html'});
			res.write(
				Mustache.render(String(source), stacheView)
			);
			res.end();
			stacheView[fileName] = '';
		}

		function renderFile(path) {
			writeRender(String(fs.readFileSync(path)));
		}

		function instURL() {
			Robinhood.instruments(parseQS.buy_symbol, function(err, response, body) {
				if (err) {
					writeRender('false');
				} else {
					writeRender(JSON.stringify(body));
				}
			});
		}

		function respHandler() {
			var args = arguments;

			if (args[0]) {
				writeRender('false');
			} else {
				writeRender(JSON.stringify(args[1]));
			}
		}

		// just requesting local pages, no ajax posts to robinhood
		if (pathName.indexOf('/ajax/') === -1) {
			var relPath = pathName.replace(/^\//, '') + ((href.length - href.lastIndexOf('.')) < 6 ? '' : '.html');

			if (fs.existsSync(relPath)) {
				renderFile(relPath);
			} else {
				renderFile('order.html');
			}

			return false;
		}

		// Start ajax post section
		if (!orderData[orderID]) {
			orderData[orderID] = {};
		}

		if (parseQS.trade_status === 'instrument') {
			Robinhood.instruments(parseQS.buy_symbol, function(err, resp, body) {
				var results = body.results[0];

				if (results) {
					orderData[orderID].instrument_url = results.url;
				}

				respHandler(err, resp);
			});
		}

		if (parseQS.trade_status === 'quote') {
			if (parseQS.buy_symbol) {
				Robinhood.quote_data(parseQS.buy_symbol, function(err, resp, body) {
					orderData[orderID].last_price_buy = body.results[0].last_trade_price;

					if (orderData[orderID].execute_buy) {
						orderData[orderID].execute_buy();
					}

					respHandler(err, resp);
				});
			}

			if (parseQS.sell_symbol) {
				Robinhood.quote_data(parseQS.sell_symbol, function(err, resp, body) {
					orderData[orderID].last_price_sell = body.results[0].last_trade_price;

					if (orderData[orderID].execute_sell) {
						orderData[orderID].execute_sell();
					}

					respHandler(err, resp);
				});
			}
		}

		if (parseQS.trade_status === 'execute') {
			if (parseQS.order_type === 'buy') {
				function executeBuy() {
					var lastPrice = float(orderData[orderID].last_price_buy);

					Robinhood.place_buy_order({
						type: 'limit',
						quantity: int(float(parseQS.cash_allotment) / lastPrice),
						bid_price: lastPrice + float(parseQS.pad_limit || 0),
						instrument: {
							url: orderData[orderID].instrument_url,
							symbol: parseQS.buy_symbol
						}
					}, respHandler);
				}

				if (orderData[orderID].last_price_buy) {
					executeBuy();
				} else {
					orderData[orderID].execute_buy = executeBuy;
				}
			}

			if (parseQS.order_type === 'sell') {
				function executeSell() {
					var lastPrice = float(orderData[orderID].last_price_sell);

					Robinhood.place_sell_order({
						type: 'limit',
						quantity: int(float(parseQS.cash_allotment) / lastPrice),
						bid_price: lastPrice - float(parseQS.pad_limit || 0),
						instrument: {
							url: orderData[orderID].instrument_url,
							symbol: parseQS.sell_symbol
						}
					}, respHandler);
				}

				if (orderData[orderID].last_price_sell) {
					executeSell();
				} else {
					orderData[orderID].execute_sell = executeSell;
				}
			}
		}

		if (parseQS.trade_status === 'cancel') {
			Robinhood.orders(function(error, resp, body){
				if (error) {
					respHandler(error, resp);
				} else {
					var allOrders = body.results,
						cancelResp = [],
						ordersLen = allOrders.length;

					for (var i = 0; i < ordersLen; i++) {
						Robinhood.cancel_order(allOrders[i], function(err, resp, body) {
							cancelResp.push(body);

							if (i === (ordersLen - 1)) {
								respHandler(false, cancelResp);
							}
						});
					}
				}
			})
		}

	}).listen(80);
});





/*
		switch (pathName.replace(/\//g)) {
			case 'quote':
				if (parseQS.trade_status === 'instrument') {
					console.log('instrument91')
					Robinhood.instruments(parseQS.buy_symbol, respHandler);
				}

				if (parseQS.trade_status === 'quote') {
					if (!orderData[orderID]) {
						orderData[orderID] = {};
					}

					if (parseQS.buy_symbol) {
						Robinhood.quote_data(parseQS.buy_symbol, function(err, resp, body) {
							orderData[orderID].last_price_buy = body.results[0].last_trade_price;

							if (orderData[orderID].execute_buy) {
								orderData[orderID].execute_buy();
							}
						});
					}

					if (parseQS.sell_symbol) {
						Robinhood.quote_data(parseQS.sell_symbol, function(err, resp, body) {
							orderData[orderID].last_price_sell = body.results[0].last_trade_price;

							if (orderData[orderID].execute_sell) {
								orderData[orderID].execute_sell();
							}
						});
					}
				}

				break;

			case 'order':
				if (parseQS.order_type === 'buy') {
					function executeBuy() {
						var lastPrice = float(orderData[orderID].last_price_buy);

						Robinhood.place_buy_order({
							type: 'limit',
							quantity: int(float(parseQS.cash_allotment) / lastPrice),
							bid_price: lastPrice + float(parseQS.pad_limit || 0),
							instrument: {
								url: orderData[orderID].instrument_url,
								symbol: parseQS.buy_symbol
							}
						}, respHandler);
					}

					if (orderData[orderID].last_price_buy) {
						executeBuy();
					} else {
						orderData[orderID].execute_buy = executeBuy;
					}
				}

				if (parseQS.order_type === 'sell') {
					function executeSell() {
						var lastPrice = float(orderData[orderID].last_price_sell);

						Robinhood.place_sell_order({
							type: 'limit',
							quantity: int(float(parseQS.cash_allotment) / lastPrice),
							bid_price: lastPrice - float(parseQS.pad_limit || 0),
							instrument: {
								url: orderData[orderID].instrument_url,
								symbol: parseQS.sell_symbol
							}
						}, respHandler);
					}

					if (orderData[orderID].last_price_sell) {
						executeSell();
					} else {
						orderData[orderID].execute_sell = executeSell;
					}
				}

				break;

			default:
				var relPath = pathName.replace(/^\//, '') + ((href.length - href.lastIndexOf('.')) < 6 ? '' : '.html');

				if (fs.existsSync(relPath)) {
					renderFile(relPath);
				} else {
					renderFile('order.html');
				}
		}

/*
		function instURL() {
			Robinhood.instruments(parseQS.buy_symbol, function(err, response, body) {
				if (err) {
					writeRender('false');
				} else {
					writeRender(JSON.stringify(body));
				}
			});
		}

		function execBuyOrder() {
			if (parseQS.trade_status === 'quote') {
				Robinhood.quote_data(parseQS.buy_symbol, function(err, resp, body) {
					orderData[orderID].last_price_buy = body.results[0].last_trade_price;

					if (orderData[orderID].execute_buy) {
						orderData[orderID].execute_buy();
					}
				});
			}

			if (parseQS.trade_status === 'place') {
				function executeBuy() {
					var lastPrice = float(orderData[orderID].last_price_buy);

					Robinhood.place_buy_order({
						type: 'limit',
						quantity: int(float(parseQS.cash_allotment) / lastPrice),
						bid_price: lastPrice + float(parseQS.pad_limit || 0),
						instrument: {
							url: orderData[orderID].instrument_url,
							symbol: parseQS.buy_symbol
						}
					}, function(error, response, body) {
						if (error) {
							writeRender(error);
						} else {
							writeRender(body);
						}
					});
				}

				if (orderData[orderID].last_price_buy) {
					executeBuy();
				} else {
					orderData[orderID].execute_buy = executeBuy;
				}
			}
		}

		function execSellOrder() {
			if (parseQS.trade_status === 'quote') {
				Robinhood.quote_data(parseQS.sell_symbol, function(err, resp, body) {
					orderData[orderID].last_price_sell = body.results[0].last_trade_price;

					if (orderData[orderID].execute_sell) {
						orderData[orderID].execute_sell();
					}
				});
			}

			if (parseQS.trade_status === 'place') {
				function executeSell() {
					var lastPrice = float(orderData[orderID].last_price_sell);

					Robinhood.place_sell_order({
						type: 'limit',
						quantity: int(float(parseQS.cash_allotment) / lastPrice),
						bid_price: lastPrice - float(parseQS.pad_limit || 0),
						instrument: {
							url: orderData[orderID].instrument_url,
							symbol: parseQS.sell_symbol
						}
					}, function(error, response, body) {
						if (error) {
							writeRender(error);
						} else {
							writeRender(body);
						}
					});
				}

				if (orderData[orderID].last_price_sell) {
					executeSell();
				} else {
					orderData[orderID].execute_sell = executeSell;
				}
			}
		}
*/

		// if (pathName.indexOf('quote') > -1) { // if localhost/ajax/ is requested
		// 	if (parseQS.trade_status === 'instrument') {
		// 		Robinhood.instruments(parseQS.buy_symbol, respHandler);
		// 	}

		// 	if (parseQS.trade_status === 'quote') {
		// 		if (!orderData[orderID]) {
		// 			orderData[orderID] = {};
		// 		}

		// 		if (parseQS.buy_symbol) {
		// 			Robinhood.quote_data(parseQS.buy_symbol, function(err, resp, body) {
		// 				orderData[orderID].last_price_buy = body.results[0].last_trade_price;
		// 			});
		// 		}

		// 		if (parseQS.sell_symbol) {
		// 			Robinhood.quote_data(parseQS.sell_symbol, function(err, resp, body) {
		// 				orderData[orderID].last_price_sell = body.results[0].last_trade_price;
		// 			});
		// 		}
		// 	}
		// } else if (pathName.indexOf('order') > -1) { // if localhost/ajax/ is requested
		// 	if (parseQS.order_type === 'buy') {
		// 		execBuyOrder();
		// 	}

		// 	if (parseQS.order_type === 'sell') {
		// 		execSellOrder();
		// 	}
		// } else {
		// 	var relPath = pathName.replace(/^\//, '') + ((href.length - href.lastIndexOf('.')) < 6 ? '' : '.html');

		// 	if (fs.existsSync(relPath)) {
		// 		renderFile(relPath);
		// 	} else {
		// 		renderFile('order.html');
		// 	}
		// }









































/*

/*
var view = {
  title: "Joe",
  calc: function () {
    return 2 + 4;
  }
};

var output = Mustache.render("{{title}} spends {{calc}}", view);


// var acctData = null,
// 	stacheView = {
// 		account_balance: acctData
// 	}
		// if (Object.keys(parseQS).length) {
		// 	if (parseQS.buy_symbol) {
		// 		Robinhood.quote_data(parseQS.buy_symbol, function(err, response, body) {
		// 			quoteData[parseQS.buy_symbol] = body.results[0].last_trade_price;
		// 		});
		// 	}
		// } else {
		// }
Robinhood.quote_data('AAPL', function(err, response, body){
        if(err){
            console.error(err);
        }else{
            console.log("quote_data");
            console.log(body);
            //{
            //    results: [
            //        {
            //            ask_price: String, // Float number in a String, e.g. '735.7800'
            //            ask_size: Number, // Integer
            //            bid_price: String, // Float number in a String, e.g. '731.5000'
            //            bid_size: Number, // Integer
            //            last_trade_price: String, // Float number in a String, e.g. '726.3900'
            //            last_extended_hours_trade_price: String, // Float number in a String, e.g. '735.7500'
            //            previous_close: String, // Float number in a String, e.g. '743.6200'
            //            adjusted_previous_close: String, // Float number in a String, e.g. '743.6200'
            //            previous_close_date: String, // YYYY-MM-DD e.g. '2016-01-06'
            //            symbol: String, // e.g. 'AAPL'
            //            trading_halted: Boolean,
            //            updated_at: String, // YYYY-MM-DDTHH:MM:SS e.g. '2016-01-07T21:00:00Z'
            //        }
            //    ]
            //}
        }
    })
Url {
  protocol: null,
  slashes: null,
  auth: null,
  host: null,
  port: null,
  hostname: null,
  hash: null,
  search: '?dan=smith&what=else',
  query: 'dan=smith&what=else',
  pathname: '/account',
  path: '/account?dan=smith&what=else',
  href: '/account?dan=smith&what=else' }

			// qsStartIdx = qs.indexOf('?') + 1,
			// parseQS = querystring.parse(qs.substr(qsStartIdx)), // sanitize query string and parse it
			// reqSym = parseQS.symbol;


		//console.log(url.parse(reqURL));

		//console.log(parseQS);

		// res.writeHead(200, {'Content-Type': 'text/html'});

		// if (parseQS['order_type']) {
		// 	res.write(parseQS['order_type']);
		// } else if (parseQS['account_info']) {
		// 	res.write(acctData);
		// } else {
		// 	res.write(
		// 		fs.readFileSync('order-page.html')
		// 	);
		// }

		//res.end();
  */



// var Robinhood = require('robinhood')(credentials, function(){
 
//     //Robinhood is connected and you may begin sending commands to the api.
 
//     Robinhood.quote_data('GOOG', function(error, response, body) {
//         if (error) {
//             console.error(error);
//             process.exit(1);
//         }
//         console.log(body);
//     });
 
// });


