/* jshint node: true */

'use strict';

module.exports = function(grunt) {
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-jscs');

  grunt.initConfig({
    jscs: {
      main: ['*.js']
    },
    jshint: {
      options: {
        jshintrc: true
      },
      files: {
        src: ['*.js']
      }
    }
  });

  grunt.registerTask('default', ['lint']);
  grunt.registerTask('lint', ['jscs', 'jshint']);
};
