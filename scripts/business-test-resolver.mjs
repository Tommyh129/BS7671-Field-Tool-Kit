export async function resolve(specifier, context, nextResolve) {
  if(context.parentURL?.endsWith('/src/business/rams/client.ts')&&specifier==='../../firebase')return {url:new URL('../tests/business-fixtures.mjs',import.meta.url).href,shortCircuit:true};
  if(context.parentURL?.endsWith('/src/business/store.ts') && specifier==='./storage-allowance')return {url:new URL('../tests/business-fixtures.mjs',import.meta.url).href,shortCircuit:true};
  if (context.parentURL?.endsWith('/src/business/invoices/client.ts') && specifier === '../../firebase') {
    return {url: new URL('../tests/business-fixtures.mjs', import.meta.url).href, shortCircuit: true};
  }
  if (
    context.parentURL?.endsWith("/src/business/store.ts") &&
    ["../firebase", "firebase/firestore", "firebase/storage"].includes(
      specifier
    )
  )
    return {
      url: new URL("../tests/business-fixtures.mjs", import.meta.url).href,
      shortCircuit: true,
    };
  return nextResolve(specifier, context);
}
