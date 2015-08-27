var gulp = require('gulp'),
    watch = require('gulp-watch');

gulp.task('watch', function () {
//     watch('./*.coffee', function() {
//     	console.log("Running gulp makeJs...");
//     	gulp.run('makeJs');
//     });
	var watcher = gulp.watch('./*.coffee', ['makeJs']);
	watcher.on('change', function(event) {
	  console.log('File ' + event.path + ' was ' + event.type + ', running tasks...');
	});
});