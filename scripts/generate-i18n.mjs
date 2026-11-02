import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const languages = ['zh-CN', 'zh-TW', 'en'];
const resources = {};
const variables = value => [...value.matchAll(/{{\s*(\w+)\s*}}/g)].map(match => match[1]).sort().join(',');
const read = file => {
    const source = fs.readFileSync(file, 'utf8');
    const ast = ts.parseJsonText(file, source);
    const visit = node => {
        if (ts.isObjectLiteralExpression(node)) {
            const keys = new Set();
            for (const property of node.properties) {
                const name = property.name?.text;
                if (keys.has(name)) throw new Error(`Duplicate key: ${file}: ${name}`);
                keys.add(name);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(ast);
    const data = JSON.parse(source);
    for (const [key, value] of Object.entries(data)) {
        if (typeof value !== 'string' || !value.trim() || /<\/?[a-z][^>]*>/i.test(value)) throw new Error(`Invalid translation: ${file}: ${key}`);
    }
    return data;
};
for (const language of languages) {
    resources[language] = {};
    for (const file of fs.readdirSync(path.join(root, 'locales', language)).sort()) {
        if (file.endsWith('.json')) resources[language][file.slice(0, -5)] = read(path.join(root, 'locales', language, file));
    }
}
const keys = [];
const contracts = {};
for (const [namespace, base] of Object.entries(resources['zh-CN'])) {
    for (const [key, value] of Object.entries(base)) {
        keys.push(`${namespace}:${key}`);
        const logicalKey = `${namespace}:${key.replace(/_(one|other|zero|two|few|many)$/, '')}`;
        contracts[logicalKey] = [...new Set([...value.matchAll(/{{\s*(\w+)\s*}}/g)].map(match => match[1]))];
        for (const language of languages) {
            const translated = resources[language][namespace]?.[key];
            if (!translated || variables(value) !== variables(translated)) throw new Error(`Missing key or mismatched variables: ${language}/${namespace}:${key}`);
        }
    }
}
for (const language of languages) {
    for (const [namespace, entries] of Object.entries(resources[language])) {
        for (const key of Object.keys(entries)) {
            if (!resources['zh-CN'][namespace]?.[key]) throw new Error(`Unexpected key: ${language}/${namespace}:${key}`);
            if (key.endsWith('_other') && language === 'en' && !entries[key.replace(/_other$/, '_one')]) throw new Error(`Missing English singular: ${namespace}:${key}`);
        }
    }
}
const knownKeys = new Set([...keys, ...Object.keys(contracts)]);
function checkReferences(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
        if (['generated', 'tests', 'assets', 'examples', 'builtin'].includes(entry.name)) continue;
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) { checkReferences(file); continue; }
        if (!/\.(ts|js|html)$/.test(file)) continue;
        const source = fs.readFileSync(file, 'utf8');
        for (const match of source.matchAll(/(?:data-i18n(?:-title|-placeholder|-aria-label|-alt|-label)?=["']|\b(?:t|th|htmlT|nativeT)\(["'])([a-z]+:[\w.]+)["']/g)) {
            if (!knownKeys.has(match[1])) throw new Error(`Unknown translation reference: ${file}: ${match[1]}`);
        }
    }
}
checkReferences(path.join(root, 'src/main'));
checkReferences(path.join(root, 'src/renderer/src'));
if (process.env.MUSICBOX_I18N_PSEUDO === '1') {
    for (const entries of Object.values(resources.en)) {
        for (const [key, value] of Object.entries(entries)) entries[key] = `［${value.replace(/{{.*?}}|[aeiou]/g, match => match.startsWith('{{') ? match : match + match)}］`;
    }
}
const parameterTypes = Object.entries(contracts).map(([key, names]) => `${JSON.stringify(key)}: {${names.map(name => `${name}: ${name === 'count' ? 'number' : 'unknown'}`).join('; ')}}`).join(';\n');
const output = `// 自动生成，请编辑 locales/ 中的源词库。\nexport const resources = ${JSON.stringify(resources, null, 2)};\nexport type TranslationKey = ${[...knownKeys].map(JSON.stringify).join(' | ')};\nexport interface TranslationParams {${parameterTypes}}\n`;
for (const target of ['src/main/i18n/generated', 'src/renderer/src/shared/i18n/generated']) {
    const directory = path.join(root, target);
    fs.mkdirSync(directory, {recursive: true});
    fs.writeFileSync(path.join(directory, 'resources.ts'), output);
    fs.copyFileSync(path.join(root, 'scripts/i18n/runtime.ts'), path.join(directory, 'runtime.ts'));
}
console.log(`Validated ${keys.length} translation keys in ${languages.length} languages.`);
