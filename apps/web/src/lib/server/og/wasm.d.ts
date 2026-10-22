declare module '*.wasm?module' {
	const wasm: WebAssembly.Module;
	export default wasm;
}
