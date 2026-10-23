const fs = require("fs");
const path = require("path");
const readline = require("readline");
const ignore = require("ignore");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;

// Read and apply .gitignore rules
function getGitIgnorer(rootDir) {
  const ignorer = ignore().add([
    "node_modules",
    ".git",
    ".next",
    ".output",
    ".vinxi",
    "build",
    "dist",
  ]);
  const gitignorePath = path.join(rootDir, ".gitignore");

  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, "utf8");
    ignorer.add(gitignoreContent);
  }
  return ignorer;
}

// Parse code safely using Babel AST
function parseCode(code) {
  try {
    return parser.parse(code, {
      sourceType: "module",
      plugins: [
        "typescript",
        "jsx",
        "decorators-legacy",
        "classProperties",
        "objectRestSpread",
        "asyncGenerators",
        "dynamicImport",
        "exportDefaultFrom",
        "exportNamespaceFrom",
      ],
    });
  } catch (err) {
    return null;
  }
}

// Extract valid comments using AST
function findRemovableComments(code) {
  const ast = parseCode(code);
  if (!ast || !ast.comments) return [];

  const removableComments = [];

  for (const comment of ast.comments) {
    const commentLower = comment.value.toLowerCase();
    // Skip oxlint and biome comments
    if (commentLower.includes("oxlint") || commentLower.includes("biome")) {
      continue;
    }

    const startLine = comment.loc.start.line;
    const endLine = comment.loc.end.line;
    const lineInfo =
      startLine === endLine
        ? `Line ${startLine}`
        : `Lines ${startLine}-${endLine}`;

    let commentText = "";
    if (comment.type === "CommentLine") {
      commentText = `//${comment.value}`;
    } else {
      commentText = `/*${comment.value}*/`;
    }

    removableComments.push({
      commentObj: comment,
      text: commentText.trim(),
      lineInfo: lineInfo,
    });
  }

  return removableComments;
}

// Remove valid comments using AST generation
function removeCommentsFromCode(code) {
  const ast = parseCode(code);
  if (!ast) return code;

  // Filter out non-oxlint and non-biome comments from AST (keep oxlint & biome)
  ast.comments = ast.comments.filter((comment) => {
    const commentLower = comment.value.toLowerCase();
    return commentLower.includes("oxlint") || commentLower.includes("biome");
  });

  // Regenerate code retaining code structure, formats, and remaining comments
  const output = generate(
    ast,
    {
      retainLines: true,
      comments: true,
      keepNumbers: true,
    },
    code,
  );

  return output.code;
}

// Recursively find all .ts and .tsx files
function getAllTsFiles(currentDir, rootDir, ignorer, fileList = []) {
  const files = fs.readdirSync(currentDir);

  for (const file of files) {
    const fullPath = path.join(currentDir, file);
    const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, "/");

    if (ignorer.ignores(relativePath)) {
      continue;
    }

    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      getAllTsFiles(fullPath, rootDir, ignorer, fileList);
    } else if (stat.isFile() && /\.(ts|tsx)$/.test(file)) {
      fileList.push({ fullPath, relativePath });
    }
  }

  return fileList;
}

// Interactive CLI processing
async function processFiles() {
  const rootDir = process.cwd();
  const ignorer = getGitIgnorer(rootDir);
  const tsFiles = getAllTsFiles(rootDir, rootDir, ignorer);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query) =>
    new Promise((resolve) => rl.question(query, resolve));

  console.log(`Scanning ${tsFiles.length} files in project...\n`);
  let processedCount = 0;
  let yesToAll = false;

  for (const { fullPath, relativePath } of tsFiles) {
    const content = fs.readFileSync(fullPath, "utf8");
    const comments = findRemovableComments(content);

    if (comments.length === 0) {
      continue;
    }

    console.log(`--------------------------------------------------`);
    console.log(`File: ${relativePath} (${comments.length} comment(s) found):`);

    comments.forEach((c) => {
      const preview =
        c.text.length > 100 ? c.text.substring(0, 100) + "..." : c.text;
      const cleanPreview = preview.replace(/\r?\n|\r/g, " ");
      console.log(`  [${c.lineInfo}] ${cleanPreview}`);
    });

    console.log("");

    let lowerAns = "";
    if (yesToAll) {
      lowerAns = "y";
      console.log(
        `Remove comments in this file? (y: Yes / n: Skip to next / q: Quit): a (Auto-approved via Yes to All)`,
      );
    } else {
      const answer = await question(
        "Remove comments in this file? (y: Yes / n: Skip to next / a: Yes to All / q: Quit): ",
      );
      lowerAns = answer.trim().toLowerCase();
    }

    if (lowerAns === "q") {
      console.log("\nOperation cancelled by user.");
      rl.close();
      return;
    }

    if (lowerAns === "a") {
      yesToAll = true;
      lowerAns = "y";
    }

    if (lowerAns === "y" || lowerAns === "yes") {
      const newContent = removeCommentsFromCode(content);
      fs.writeFileSync(fullPath, newContent, "utf8");
      console.log(`Comments removed from ${relativePath}\n`);
      processedCount++;
    } else {
      console.log(`Skipped ${relativePath}\n`);
    }
  }

  console.log(`--------------------------------------------------`);
  console.log(
    `Process complete. Cleared comments from ${processedCount} file(s).`,
  );
  rl.close();
}

processFiles();
