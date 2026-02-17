const path = require("path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const PROTO_PATH = path.resolve(__dirname, "../../../../packages/contracts/proto/product.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const productProto = grpc.loadPackageDefinition(packageDefinition).product.v1;

async function startProductGrpcServer({ port, reserveStock }) {
  const server = new grpc.Server();

  server.addService(productProto.ProductService.service, {
    CheckAndReserveStock: async (call, callback) => {
      try {
        const response = await reserveStock(call.request || {});
        callback(null, response);
      } catch (error) {
        callback({
          code: grpc.status.INTERNAL,
          message: error.message
        });
      }
    }
  });

  await new Promise((resolve, reject) => {
    server.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (error) => {
        if (error) {
          return reject(error);
        }

        server.start();
        console.log(`[product-service] gRPC listening on ${port}`);
        return resolve();
      }
    );
  });

  return server;
}

module.exports = {
  startProductGrpcServer
};
