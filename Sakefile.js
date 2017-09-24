use('sake-bundle')
use('sake-outdated')
use('sake-publish')
use('sake-version')

task('clean', 'clean project', ()=> {
  exec('rm -rf lib/')
})

task('build', 'build project', ()=> {
  bundle.write({entry: 'src/index.js'})
})

task('lint', 'lint project', ()=> {
  exec('eslint --config ./.eslintrc.json --no-color --quiet --ext js,.es6,.jsx ./')
})

task('test', 'test project', ()=> {
  exec('mocha ./dist/tests/*-test.js; npm run lint')
})
