/* jshint node: true */

'use strict';

module.exports = function(grunt) {
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-jscs');

  grunt.initConfig({
    jscs: {
      main: ['src/**/*.js']
    },
    jshint: {
      options: {
        jshintrc: true
      },
      files: {
        src: ['src/**/*.js']
      }
    }
  });

  grunt.registerTask('default', ['lint']);
  grunt.registerTask('lint', ['jscs', 'jshint']);
};
