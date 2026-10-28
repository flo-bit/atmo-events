import { defineParams } from '@sveltejs/kit/params';
import { isActorIdentifier } from '@atcute/lexicons/syntax';

const matchActor = (param: string) => {
	return isActorIdentifier(param);
};

export const params = defineParams({
	actor: (param) => (matchActor(param) ? param : undefined)
});
