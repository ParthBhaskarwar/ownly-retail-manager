// onnxruntime rejects typed arrays created inside Jest's sandbox realm.
// Exposing the real Node typed-array constructors fixes the model tests.
const { TestEnvironment } = require('jest-environment-node');

class TypedArrayEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    for (const name of ['ArrayBuffer', 'Uint8Array', 'Int32Array', 'Float32Array', 'BigInt64Array']) {
      this.global[name] = global[name];
    }
  }
}

module.exports = TypedArrayEnvironment;
