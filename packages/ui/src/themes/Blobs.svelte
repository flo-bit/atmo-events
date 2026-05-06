<div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-base-50 dark:bg-base-900">
	<div
		class="blob-1 absolute rounded-full bg-accent-500 opacity-30 blur-3xl"
		style="width: 40vw; height: 40vw; top: -10%; left: -5%;"
	></div>
	<div
		class="blob-2 absolute rounded-full bg-accent-500 opacity-20 blur-3xl"
		style="width: 35vw; height: 35vw; bottom: -5%; right: -10%;"
	></div>
	<div
		class="blob-3 absolute rounded-full bg-accent-400 opacity-15 blur-3xl"
		style="width: 25vw; height: 25vw; top: 40%; left: 50%;"
	></div>
</div>

<style>
	@keyframes blob-float-1 {
		0%, 100% { transform: translate(0, 0) scale(1); }
		33% { transform: translate(5vw, 8vh) scale(1.1); }
		66% { transform: translate(-3vw, 4vh) scale(0.95); }
	}
	@keyframes blob-float-2 {
		0%, 100% { transform: translate(0, 0) scale(1); }
		33% { transform: translate(-6vw, -5vh) scale(1.05); }
		66% { transform: translate(4vw, -8vh) scale(1.1); }
	}
	@keyframes blob-float-3 {
		0%, 100% { transform: translate(0, 0) scale(1); }
		33% { transform: translate(8vw, -4vh) scale(1.15); }
		66% { transform: translate(-5vw, 6vh) scale(0.9); }
	}
	.blob-1 { animation: blob-float-1 20s ease-in-out infinite; }
	.blob-2 { animation: blob-float-2 25s ease-in-out infinite; }
	.blob-3 { animation: blob-float-3 22s ease-in-out infinite; }
</style>
