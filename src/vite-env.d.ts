/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_APP_PASSCODE?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
