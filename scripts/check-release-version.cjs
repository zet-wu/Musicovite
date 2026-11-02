const {version} = require('../package.json');
const requested = process.env.RELEASE_VERSION;
if (requested !== `v${version}`) {
    throw new Error(`发布输入必须与应用版本一致：v${version}，收到 ${requested}`);
}
console.log(`Release version verified: ${requested}`);
