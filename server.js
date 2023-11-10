const express = require("express");
const WebSocket = require("ws");
const { XMLParser } = require("fast-xml-parser");
require("dotenv").config();

const username = process.env.USERNAME;
const password = process.env.PASSWORD;
const accountId = process.env.ACCOUNT_ID;
const originUrl = process.env.ORIGIN_URL;
const port = process.env.PORT;

if (!username || !password || !port) {
    throw new Error("Missing environment variables");
}

const servers = {};
getServers();
setTimeout(getServers, 3600000);

async function getServers() {
    const serversUrl = "https://empire-html5.goodgamestudios.com/config/network/1.xml";
    const serversFile = new XMLParser().parse(await fetch(serversUrl).then((res) => res.text()));

    for (instance of serversFile.network.instances.instance) {
        if (instance.zone !== "EmpireEx_23" && !(instance.zone in servers)) {
            servers[instance.zone] = {
                url: `wss://${instance.server}`,
                socket: new WebSocket(`wss://${instance.server}`),
                reconnect: true,
                message: {},
                response: "",
            };

            connect(instance.zone);
        }
    }
}

function connect(header) {
    const socket = servers[header].socket;

    socket.addEventListener("open", (event) => {
        socket.send(
            `<msg t='sys'><body action='login' r='0'><login z='${header}'><nick><![CDATA[]]></nick><pword><![CDATA[1089002%en%0]]></pword></login></body></msg>`
        );

        socket.send(
            `%xt%${header}%lli%1%{"CONM":139,"RTM":24,"ID":0,"PL":1,"NOM":"FrostyBoy","PW":"DKTP5500!!5","LT":null,"LANG":"en","DID":"0","AID":"1698591511447444964","KID":"","REF":"https://empire.goodgamestudios.com","GCI":"","SID":9,"PLFID":1}%`
        );
    });

    socket.addEventListener("message", (event) => {
        const eventData = event.data.toString().split("%");

        const response = {
            server: header,
            command: eventData[2],
            code: eventData[4],
            content: JSON.parse(JSON.stringify(eventData[5])),
        };

        if (response.command === "lli") {
            if (response.code === "0") {
                pingSocket(socket, header);
            } else if (response.code === "21") {
                socket.send(
                    `%xt%${header}%lre%1%{"DID":0,"CONM":515,"RTM":60,"campainPId":-1,"campainCr":-1,"campainLP":-1,"adID":-1,"timeZone":14,"username":"${username}","email":null,"password":"${password}","accountId":"${accountId}","ggsLanguageCode":"en","referrer":"https://empire.goodgamestudios.com","distributorId":0,"connectionTime":515,"roundTripTime":60,"campaignVars":";https://empire.goodgamestudios.com;;;;;;-1;-1;;1681390746855129824;0;;;;;","campaignVars_adid":"-1","campaignVars_lp":"-1","campaignVars_creative":"-1","campaignVars_partnerId":"-1","campaignVars_websiteId":"0","timezone":14,"PN":"${username}","PW":"${password}","REF":"https://empire.goodgamestudios.com","LANG":"fr","AID":"1681390746855129824","GCI":"","SID":9,"PLFID":1,"NID":1,"IC":""}%`
                );
            } else {
                socket.close();
            }
        } else if (response.command === "lre") {
            if (response.code === "0") {
                pingSocket(socket, header);
            } else {
                servers[header].reconnect = false;
                socket.close();
            }
        } else if (response.command === "hgh") {
            let content;

            try {
                content = JSON.parse(response.content);
            } catch {
                content = response.content;
            }

            servers[header].response = {
                ...response,
                content: content,
            };
        }
    });

    socket.addEventListener("error", (event) => {
        console.log(`Error in socket ${header}:\n${event.message}`);

        if (["ENOTFOUND", "ETIMEDOUT"].includes(event.error.code)) {
            servers[header].reconnect = false;
        }

        socket.close();
    });

    socket.addEventListener("close", (event) => {
        if (servers[header].reconnect) {
            setTimeout(() => connect(header), 10000);
        } else {
            console.log(`Socket ${header} closed permanently.`);
            delete servers[header];
        }
    });
}

function pingSocket(socket, header) {
    if (socket.readyState != WebSocket.CLOSED && socket.readyState != WebSocket.CLOSING) {
        console.log(`Pinging socket ${header}`);
        socket.send(`%xt%${header}%pin%1%<RoundHouseKick>%`);
        setTimeout(() => pingSocket(socket, header), 60000);
    }
}

const app = express();

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", originUrl);
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "X-Requested-With,content-type");
    next();
});

app.get("/:server/:command/:headers", async (req, res) => {
    const { server, command, headers } = req.params;

    if (server in servers) {
        try {
            servers[server].socket.send(`%xt%${server}%${command}%1%{${headers}}%`);

            servers[server].message = {
                server: server,
                command: command,
                headers: JSON.parse(`{${headers}}`),
            };

            const response = await getSocketResponse(
                {
                    server: server,
                    command: command,
                    headers: JSON.parse(`{${headers}}`),
                },
                0
            );

            if (response.content.error) {
                res.status(500);
            } else {
                res.status(200);
            }

            res.json(response || {});
        } catch {
            res.status(500);
            res.json({
                code: "-1",
                server: server,
                command: command,
                content: { error: "Cannot send message" },
            });
        }
    } else {
        res.status(404);
        res.json({
            code: "-1",
            server: server,
            command: command,
            content: { error: "Cannot find server" },
        });
    }
});

app.listen(port, () => {
    console.log(`Express Server listening on port ${port}`);
});

async function getSocketResponse(message, tries) {
    if (tries < 20) {
        const response = servers[message.server].response;

        if (response) {
            servers[message.server].response = "";
            return response;
        } else {
            return await new Promise((resolve) =>
                setTimeout(() => resolve(getSocketResponse(message, tries + 1)), 50)
            );
        }
    } else {
        return {
            code: "-1",
            server: message.server,
            command: message.command,
            content: { error: "Cannot get response" },
        };
    }
}
