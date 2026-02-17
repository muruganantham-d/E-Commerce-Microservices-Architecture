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

function createProductGrpcClient(address) {
  return new productProto.ProductService(address, grpc.credentials.createInsecure());
}

function checkAndReserveStock(client, request) {
  return new Promise((resolve, reject) => {
    client.CheckAndReserveStock(request, (error, response) => {
      if (error) {
        return reject(error);
      }
      return resolve(response);
    });
  });
}

module.exports = {
  createProductGrpcClient,
  checkAndReserveStock
};
