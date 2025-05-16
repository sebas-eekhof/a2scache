import { createSocket } from 'dgram';
import { createClient, RESP_TYPES } from 'redis';
import { config } from 'dotenv';

config();

(async () => {

    const client = await createClient({
        url: process.env.REDIS_URL
    })
        .withTypeMapping({
            [RESP_TYPES.BLOB_STRING]: Buffer
        })
        .on('error', err => console.log('Redis Client Error', err))
        .connect();

    async function Request(command: Buffer): Promise<Buffer> {
        return await new Promise((resolve, reject) => {
            const gameServerSocket = createSocket('udp4');
            gameServerSocket.send(command, parseInt(process.env.PROXY_PORT as string), process.env.PROXY_HOST as string, (err) => {
                if(err) {
                    console.log('Error while sending...', err);
                    return reject(err);
                }
            });
            gameServerSocket.on('message', (res) => {
                gameServerSocket.close();
                return resolve(res);
            });
        });
    }

    function Transform29Buffer(buffer: Buffer): Buffer {
        return Buffer.from(
            buffer.toString('hex')
                .replace('2c6370302c', Buffer.from(`,cp47,`).toString('hex'))
                .replace('00000000', '0000002f')
            , 'hex');
    }
    
    const server = createSocket('udp4');

    server.on('message', async (msg, rinfo) => {
        const key = `A2S:${msg.length}`;
        const cache = await client.get(key);

        if(cache)
            server.send(cache, rinfo.port, rinfo.address);
        else {
            const res = (msg.length === 29) ? Transform29Buffer(await Request(msg)) : await Request(msg);
            client.set(`DEBUG:${msg.toString('hex')}`, res, { expiration: { type: 'EX', value: 600 } });
            client.set(key, res, { expiration: { type: 'EX', value: 30 } });
            server.send(res, rinfo.port, rinfo.address);
        }
    });

    server.on('listening', () => {
        const address = server.address();
        console.log(`A2S Cache Server listening on ${address.address}:${address.port}`);
    });

    server.bind(27017);

    server.on('error', (err) => {
        console.error(`Server error:\n${err.stack}`);
        server.close();
    });

})();
