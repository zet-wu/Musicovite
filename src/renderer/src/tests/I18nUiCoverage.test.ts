import {describe, expect, it} from 'vitest';
import {readFileSync, readdirSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
function files(directory: string): string[] {
    return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
        const file = join(directory, entry.name);
        return entry.isDirectory() ? files(file) : /\.(ts|js)$/.test(file) ? [file] : [];
    });
}

describe('动态界面文案覆盖', () => {
    it('页面、菜单和提示模板不包含未提取的中文正文或辅助标签', () => {
        const failures: string[] = [];
        for (const file of ['app', 'ui', 'features'].flatMap(folder => files(join(sourceRoot, folder)))) {
            const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
            const visit = (node: ts.Node) => {
                if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
                    || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
                    // 注释、日志、业务数据和用户内容不属于待翻译的模板正文。
                    const text = node.text.replace(/<!--[\s\S]*?-->/g, '');
                    const visibleParts = [
                        ...text.matchAll(/>([^<>]*)</g),
                        ...text.matchAll(/\b(?:aria-label|title|alt|placeholder)="([^"]*)"/g)
                    ];
                    for (const match of visibleParts) {
                        if (/\p{Script=Han}/u.test(match[1])) {
                            const line = ast.getLineAndCharacterOfPosition(node.getStart()).line + 1;
                            failures.push(`${relative(sourceRoot, file)}:${line}: ${match[1].trim()}`);
                        }
                    }
                }
                ts.forEachChild(node, visit);
            };
            visit(ast);
        }
        expect(failures).toEqual([]);
    });
});
