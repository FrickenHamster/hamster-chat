/**
 * Created by Hamster on 6/28/2015.
 */
//Hamster Chat
"use strict";

var debugging = true;

var webSocketsServerPort = 1338;

var webSocketServer = require('websocket').server;
var http = require('http');

var chatProtocols = require('./ChatProtocol.js');

/**
 * Global variables
 */
var maxHistory = 200;
var chatHistory = [];

var maxClients = 500;
var clientNum;
var clients = {};
var activeClients = [];
var freeIDs = [];

/**
 * HTTP server
 */
var server = http.createServer(function (request, response)
{
	// Not important for us. We're writing WebSocket server, not HTTP server
});
server.listen(webSocketsServerPort, function ()
{
	clientNum = 0;
	for (var i = maxClients - 1; i >= 0; i--)
	{
		freeIDs.push(i);
	}
	serverLog("Server started listening on port " + webSocketsServerPort);
});

/**
 * WebSocket server
 */
var wsServer = new webSocketServer({
	// WebSocket server is tied to a HTTP server. WebSocket request is just
	// an enhanced HTTP request. For more info http://tools.ietf.org/html/rfc6455#page-6
	httpServer: server
});


wsServer.on('request', function (request)
{

	// accept connection - you should check 'request.origin' to make sure that
	// client is connecting from your website
	// (http://en.wikipedia.org/wiki/Same_origin_policy)

	var connection = request.accept(null, request.origin);

	if (clientNum >= maxClients)
	{
		//return full
		connection.close();
	}

	var client = {};
	client.connection = connection;

	// we need to know client index to remove them on 'close' event
	client.active = false;
	client.id = false;
	//activeClients.push(client);
	client.userName = false;
	client.userColor = false;

	serverLog("New connection from" + connection.remoteAddress);

	//delete if no join response after 10 seconds
	var joinTimer = setTimeout(function ()
	{
		if (client.active == false)
		{
			serverLog("Closing connection from " + connection.remoteAddress);
			client.connection.close();
		}
	}, 10000);
	
	// send back chat history
	/*if (chatHistory.length > 0)
	 {
	 connection.sendUTF(JSON.stringify({type: 'history', data: history}));
	 }*/

	//sendHistory(connection);
	
	// user sent some message
	connection.on('message', function (message)
	{
		if (message.type === 'utf8')
		{ // only utf valid
			var data = JSON.parse(message.utf8Data);
			if (client.active == false)
			{
				if (data[0] == chatProtocols.JOIN)
				{
					clearTimeout(joinTimer);
					
					client.userName = data[1];
					client.active = true;
					var id = freeIDs.pop();
					client.id = id;
					clients[id] = client;
					clientNum++;
					sendSetID(client, id);
					sendUsers(client);
					sendHistory(client);
					activeClients.push(client);
					for (var curInd in activeClients)
					{
						sendNewUser(activeClients[curInd], client.id, data[1]);
					}
					
					serverLog(client.userName + " has joined the room");
					addHistory("Oniichan", client.userName + " has joined the room");
				}
			}
			else
			{
				switch (data[0])
				{
					case chatProtocols.SET_USERNAME:
						client.userName = data[1];
						for (var i = 0; i < activeClients.length; i++)
						{
							var tarClient = clients[i];
							sendSetUserName(tarClient, client.id, data[1]);
						}
						break;

					case chatProtocols.SEND_CHAT_MESSAGE:
						var text = stringCleaner(data[1]);
						//var client = clients[user];
						for (var i = 0; i < activeClients.length; i++)
						{
							var tarClient = activeClients[i];
							sendChatMessage(tarClient, client.id, text);
						}
						serverLog(client.userName + ":" + text);
						addHistory(client.userName, text);
						break;
				}
			}
		}
	});

	// user disconnected
	connection.on('close', function (connection)
	{
		if (client.active)
		{
			var cind = activeClients.indexOf(client);
			if (cind > -1)
				activeClients.splice(cind, 1);
			freeIDs.push(client.id);
			delete clients[client.id];
			client.active = false;
			for (var i in activeClients)
			{
				sendUserLeft(activeClients[i], client.id);
			}
			
			serverLog(client.userName + " has disconnected");
			addHistory("Oniichan", client.userName + " has disconnected");
			
			
		}

	});

});


function sendSetID(targetClient, id)
{
	var data = [chatProtocols.SET_ID, id];
	targetClient.connection.send(JSON.stringify(data));
}

function sendNewUser(targetClient, newID, newUserName)
{
	var data = [chatProtocols.NEW_USER, newID, newUserName];
	targetClient.connection.send(JSON.stringify(data));
}
function sendUsers(targetClient)
{
	var data = [chatProtocols.SEND_USERS];
	for (var i = 0; i < activeClients.length; i++)
	{
		var client = activeClients[i];
		data.push(client.id);
		data.push(client.userName);
	}
	targetClient.connection.send(JSON.stringify(data));
}
function sendHistory(targetClient)
{
	var data = [chatProtocols.SEND_HISTORY];
	for (var i in chatHistory)
	{
		data.push(chatHistory[i].sender);
		data.push(chatHistory[i].text);
	}
	targetClient.connection.send(JSON.stringify(data));
}

function sendSetUserName(targetClient, clientID, userName)
{
	var data = [chatProtocols.SET_USERNAME, clientID, userName];
	targetClient.connection.send(JSON.stringify(data));
}

function sendChatMessage(targetClient, senderID, chatMessage)
{
	var data = [chatProtocols.SEND_CHAT_MESSAGE, senderID, chatMessage]
	//console.log(targetClient);
	targetClient.connection.send(JSON.stringify(data));
}

function sendUserLeft(targetClient, leftID)
{
	var data = [chatProtocols.USER_LEFT, leftID];
	console.log("sentleft", leftID);
	targetClient.connection.send(JSON.stringify(data));
}

function serverLog(str1)
{
	var date = new Date();
	var dtext = date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
	console.log(dtext + "-" + str1);
}

function addHistory(sender, text)
{
	if (chatHistory > maxHistory)
	{
		chatHistory.shift();
	}
	chatHistory.push({sender:sender, text:text});
}

function debugText(str)
{
	if (debugging)
	{
		console.log("DEBUG" + str);
	}
}

/**
 * Helper function for escaping input strings
 */
function stringCleaner(str)
{
	return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
		.replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

