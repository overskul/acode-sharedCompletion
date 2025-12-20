import * as esbuild from 'esbuild';
import archiver from 'archiver';
import path from 'path';
import fs from 'fs';
import { mkdir, copyFile, readdir, stat } from 'fs/promises';

// constants
const _portArg = process.argv.find(arg => arg.startsWith('--port='));
const PORT = _portArg ? parseInt(_portArg.split('=')[1]) : 3000;
const IS_SERVE = process.argv.includes('--serve');
const ENTRY_FILE = 'src/main.js';
const BUILD_DIRY = 'dist';

// esbuild config
const buildConfig = {
  entryPoints: [ENTRY_FILE],
  bundle: true,
  minify: true,
  logLevel: 'info',
  color: true,
  outdir: BUILD_DIRY,
  plugins: [buildZIP()],
  loader: {
    ".html": "text",
    ".css": "text"
  }
};

// Main function to handle both serve and production builds
(async function () {
  if (IS_SERVE) {
    console.log('\nStarting development server...\n');
    // Watch and Serve Mode
    const ctx = await esbuild.context(buildConfig);
    await ctx.watch();
    const { host } = await ctx.serve({
      servedir: '.',
      port: PORT
    });
    console.log(`\nDevelopment server running on http://localhost:${PORT}\n`);
  } else {
    console.log('\nBuilding for production...\n');
    await esbuild.build(buildConfig);
    console.log('\nProduction build complete.');
  }
})();

function buildZIP(options = {}) {
  const { jsonPath = './plugin.json', outDir = 'dist', createZip = true, zipFileName = null } = options;

  return {
    name: 'build-zip',
    setup(build) {
      build.onEnd(async result => {
        if (result.errors.length > 0) return;

        try {
          const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

          await ensureDir(outDir);

          // Process and copy the modified plugin.json
          const modifiedJsonContent = await processPluginJson(jsonContent);
          const destJsonPath = path.join(outDir, path.basename(jsonPath));
          fs.writeFileSync(destJsonPath, JSON.stringify(modifiedJsonContent, null, 2));
          console.log(`✅ Copied and processed ${jsonPath} to ${outDir}`);

          if (jsonContent.readme) await copyFileIfExists(jsonContent.readme, path.join(outDir, path.basename(jsonContent.readme)));
          if (jsonContent.changelog) await copyFileIfExists(jsonContent.changelog, path.join(outDir, path.basename(jsonContent.changelog)));
          if (jsonContent.icon) await copyFileIfExists(jsonContent.icon, path.join(outDir, path.basename(jsonContent.icon)));

          if (Array.isArray(jsonContent.files) && jsonContent.files.length > 0) {
            for (const file of jsonContent.files) {
              if (typeof file === 'string') {
                await copyFileOrDirectory(file, path.join(outDir, path.basename(file)));
              } else if (typeof file === 'object' && file.path) {
                const destPath = file.dest || path.basename(file.path);
                const fullDestPath = path.join(outDir, destPath);

                await ensureDir(path.dirname(fullDestPath));
                await copyFileOrDirectory(file.path, fullDestPath);
              }
            }
          }

          if (createZip) {
            const zipName = zipFileName || `${jsonContent.id || 'package'}-${jsonContent.version || '1.0.0'}.zip`;
            await createZipArchive(outDir, zipName);
          }

          console.log('📦 All files processed successfully');
        } catch (error) {
          console.error(`❌ Build Error: ${error.message}`);
        }
      });

      async function processPluginJson(jsonContent) {
        const processedJson = { ...jsonContent };
        
        if (Array.isArray(processedJson.files)) {
          processedJson.files = processedJson.files.map(file => {
            if (typeof file === 'object' && file.path && file.dest) {
              // Replace object with just the dest value
              return file.dest;
            }
            return file;
          });
        }
        
        return processedJson;
      }

      async function ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) {
          await mkdir(dirPath, { recursive: true });
        }
      }

      async function copyFileIfExists(src, dest) {
        try {
          if (fs.existsSync(src)) {
            await ensureDir(path.dirname(dest));
            await copyFile(src, dest);
            console.log(`✅ Copied ${src} to ${dest}`);
          } else {
            console.log(`❌ File not found: ${src}`);
          }
        } catch (error) {
          console.error(`❌ Error copying ${src} to ${dest}: ${error.message}`);
        }
      }

      async function copyFileOrDirectory(src, dest) {
        try {
          if (!fs.existsSync(src)) {
            console.log(`❌ Path not found: ${src}`);
            return;
          }

          const srcStat = await stat(src);

          if (srcStat.isFile()) {
            // Handle file copying
            await ensureDir(path.dirname(dest));
            await copyFile(src, dest);
            console.log(`✅ Copied file ${src} to ${dest}`);
          } else if (srcStat.isDirectory()) {
            // Handle directory copying
            await copyDirectory(src, dest);
          }
        } catch (error) {
          console.error(`❌ Error copying ${src} to ${dest}: ${error.message}`);
        }
      }

      async function copyDirectory(srcDir, destDir) {
        try {
          await ensureDir(destDir);
          console.log(`✅ Copying directory ${srcDir} to ${destDir}`);

          const entries = await readdir(srcDir, { withFileTypes: true });
          let successCount = 0;
          let loggedCount = 0;
          const maxLogs = 20;

          for (const entry of entries) {
            const srcPath = path.join(srcDir, entry.name);
            const destPath = path.join(destDir, entry.name);

            try {
              if (entry.isDirectory()) {
                // Recursively copy subdirectories
                await copyDirectory(srcPath, destPath);
                successCount++;
              } else if (entry.isFile()) {
                // Copy individual files
                await copyFile(srcPath, destPath);
                successCount++;
                
                // Log individual file copy only for first 20 files
                if (loggedCount < maxLogs) {
                  console.log(`  ✅ Copied ${srcPath} to ${destPath}`);
                  loggedCount++;
                }
              }
            } catch (error) {
              // Always log failed operations
              console.error(`  ❌ Failed to copy ${srcPath}: ${error.message}`);
            }
          }

          // Show summary if there were more files than we logged
          const remainingCount = successCount - loggedCount;
          if (remainingCount > 0) {
            console.log(`  and (${remainingCount}) other files...`);
          }

          console.log(`✅ Finished copying directory ${srcDir} (${successCount} items)`);
        } catch (error) {
          console.error(`❌ Error copying directory ${srcDir} to ${destDir}: ${error.message}`);
        }
      }

      async function createZipArchive(sourceDir, zipFileName) {
        return new Promise((resolve, reject) => {
          const output = fs.createWriteStream(zipFileName);
          const archive = archiver('zip', { zlib: { level: 9 } });

          output.on('close', () => {
            console.log(`📦 Created ${zipFileName} (${archive.pointer()} bytes)`);
            resolve();
          });

          archive.on('error', err => {
            reject(err);
          });

          archive.pipe(output);
          archive.directory(sourceDir, false);
          archive.finalize();
        });
      }
    }
  };
}