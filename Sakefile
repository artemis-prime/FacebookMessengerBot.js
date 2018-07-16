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
