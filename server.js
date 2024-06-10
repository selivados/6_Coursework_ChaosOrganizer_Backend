const http = require("http");
const Koa = require("koa");
const WebSocket = require("ws");
const moment = require("moment");
const { randomUUID } = require("crypto");

const messages = require("./demo-messages");
const stackLength = 10;

const app = new Koa();
const port = process.env.PORT || 7070;
const server = http.createServer(app.callback());
const wsServer = new WebSocket.Server({ server });

function* generator(messages) {
  let stacksCount = Math.ceil(messages.length / stackLength);

  while (stacksCount) {
    const stackMessages = messages.slice(-stackLength);
    messages.splice(-stackLength, stackLength);
    stacksCount--;
    yield stackMessages;
  }
}

wsServer.on("connection", (ws) => {
  const lastMessages = messages.slice(-stackLength);
  const remainingMessages = messages.slice(0, -stackLength);

  ws.on("message", (e) => {
    const data =  JSON.parse(e);
    const { message, getOldMessages, reminder } = data;

    if (message) {
      const newMessage = {
        id: randomUUID(),
        ...message,
        created: Date.now(),
      };

      messages.push(newMessage);
      const eventData = JSON.stringify({ message: newMessage });

      Array.from(wsServer.clients)
        .filter(client => client.readyState === WebSocket.OPEN)
        .forEach(client => client.send(eventData));
    }

    if (getOldMessages) {
      const oldMessages = generator(remainingMessages).next();

      if (!oldMessages.done) {
        ws.send(JSON.stringify({ oldMessages: oldMessages.value.reverse() }));
      }
    }

    if (reminder) {
      const serviceMessage = {
        from: "chaos-organizer-bot",
        type: "message/text",
        textContent: `Установлено напоминание:<br/> 
        ${moment(reminder.alertTime).format("HH:mm DD.MM.YYYY")}<br/>
        ${reminder.textContent}`,
      }

      ws.send(JSON.stringify({ message: serviceMessage }));

      const today = moment();
      const diffTime = moment(reminder.alertTime).diff(today);

      setTimeout(() => {
        const reminderMessage = {
          from: "chaos-organizer-bot",
          textContent: `Напоминание: ${reminder.textContent}`,
        };

        ws.send(JSON.stringify({ reminder: reminderMessage }));
      }, diffTime);
    }
  });

  ws.send(JSON.stringify({ lastMessages }));
});

server.listen(port, () => console.log(`The server is running on port ${port}.`));
