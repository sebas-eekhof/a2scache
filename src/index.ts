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
    
    const server = createSocket('udp4');

    server.on('message', async (msg, rinfo) => {
        const key = `A2S:${msg.toString('hex')}`;
        const cache = await client.get(key);

        if(cache)
            server.send(cache, rinfo.port, rinfo.address);
        else {
            const res: Buffer = await new Promise((resolve, reject) => {
                const gameServerSocket = createSocket('udp4');
                gameServerSocket.send(msg, parseInt(process.env.PROXY_PORT as string), process.env.PROXY_HOST as string, (err) => {
                    if(err)
                        console.log('Error while sending...', err)
                });
                gameServerSocket.on('message', (res) => {
                    gameServerSocket.close();
                    return resolve(res);
                });
            });
            client.set(key, res, { expiration: { type: 'EX', value: 6 } });
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
