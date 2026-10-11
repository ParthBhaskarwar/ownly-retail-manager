// Photo AI needs a ~90 MB model download and the pgvector migration, so it is
// off for the regular test run. Set RUN_MODEL_TESTS=true to exercise it.
if (process.env.RUN_MODEL_TESTS !== 'true') {
  process.env.EMBEDDINGS_ENABLED = 'false';
}
