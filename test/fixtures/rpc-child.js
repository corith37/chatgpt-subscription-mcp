import { createInterface } from 'node:readline';
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const deferred = [];
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') send({ id: message.id, result: { ready: true } });
  if (message.method === 'echo') {
    deferred.push(message);
    if (deferred.length === 2) for (const request of deferred.reverse()) send({ id: request.id, result: request.params });
  }
  if (message.method === 'askApproval') {
    send({ id: 'server-approval', method: 'item/commandExecution/requestApproval', params: {} });
    send({ id: message.id, result: {} });
  }
  if (message.id === 'server-approval') send({ method: 'test/decision', params: message.result });
});
