/**
 * @license
 * Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

'use strict';

const path = require('path');
const gulp = require('gulp');
const mergeStream = require('merge-stream');
const polymer = require('polymer-build');

// This is the heart of polymer-build, and exposes much of the
// work that Polymer CLI usually does for you
// There are tasks to split the source files and dependency files into
// streams, and tasks to rejoin them and output service workers
// You should not need to modify anything in this file
// If you find that you can't accomplish something because of the way
// this module is structured please file an issue
// https://github.com/PolymerElements/generator-polymer-init-custom-build/issues

class PolymerProject {
  constructor(config) {
    this.polymerJSON = require(config.polymerJsonPath);
    this.project = new polymer.PolymerProject(this.polymerJSON);
    this.bundledPath = path.join(config.build.rootDirectory, config.build.bundledDirectory);
    this.unbundledPath = path.join(config.build.rootDirectory, config.build.unbundledDirectory);
    this.bundleType = config.build.bundleType;
    this.swPrecacheConfig = config.swPrecacheConfig;
    this.serviceWorkerPath = config.serviceWorkerPath;
  }

  // Returns a ReadableStream of all the source files
  // Source files are those in src/** as well as anything
  // added to the sourceGlobs property of polymer.json
  splitSource() {
    return this.project.sources()
      .pipe(this.project.splitHtml());
  }

  // Returns a ReadableStream of all the dependency files
  // Dependency files are those in bower_components/**
  splitDependencies() {
    return this.project.dependencies()
      .pipe(this.project.splitHtml());
  }

  // Returns a WriteableStream to rejoin all split files
  rejoin() {
    return this.project.rejoinHtml();
  }

  // Returns a function which accepts references to functions that generate
  // ReadableStreams. These ReadableStreams will then be merged, and used to
  // generate the bundled and unbundled versions of the site.
  // Takes an argument for the user to specify the kind of output they want
  // either bundled or unbundled. If this argument is omitted it will output both
  merge(source, dependencies) {
    var _this = this;

    return function output() {
      const mergedFiles = mergeStream(source(), dependencies())
        .pipe(_this.project.analyzer);
      let outputs = [];

      if (_this.bundleType === 'both' || _this.bundleType === 'bundled') {
        outputs.push(_this.writeBundledOutput(polymer.forkStream(mergedFiles)));
      }
      if (_this.bundleType === 'both' || _this.bundleType === 'unbundled') {
        outputs.push(_this.writeUnbundledOutput(polymer.forkStream(mergedFiles)));
      }

      return Promise.all(outputs);
    };
  }

  // Run the files through a bundling step which will vulcanize/shard them
  // then output to the dest dir
  writeBundledOutput(stream) {
    return new Promise(resolve => {
      stream.pipe(this.project.bundler)
        .pipe(gulp.dest(this.bundledPath))
        .on('end', resolve);
    });
  }

  // Just output files to the dest dir without bundling. This is for projects that
  // use HTTP/2 server push
  writeUnbundledOutput(stream) {
    return new Promise(resolve => {
      stream.pipe(gulp.dest(this.unbundledPath))
        .on('end', resolve);
    });
  }

  // Returns a function which takes an argument for the user to specify the kind
  // of bundle they're outputting (either bundled or unbundled) and generates a
  // service worker for that bundle.
  // If this argument is omitted it will create service workers for both bundled
  // and unbundled output
  serviceWorker() {
    let workers = [];

    if (this.bundleType === 'both' || this.bundleType === 'bundled') {
      workers.push(this.writeBundledServiceWorker());
    }
    if (this.bundleType === 'both' || this.bundleType === 'unbundled') {
      workers.push(this.writeUnbundledServiceWorker());
    }

    return Promise.all(workers);
  }

  // Returns a Promise to generate a service worker for bundled output
  writeBundledServiceWorker() {
    return polymer.addServiceWorker({
      project: this.project,
      buildRoot: this.bundledPath,
      swConfig: this.swPrecacheConfig,
      serviceWorkerPath: this.serviceWorkerPath,
      bundled: true
    });
  }

  // Returns a Promise to generate a service worker for unbundled output
  writeUnbundledServiceWorker() {
    return polymer.addServiceWorker({
      project: this.project,
      buildRoot: this.unbundledPath,
      swConfig: this.swPrecacheConfig,
      serviceWorkerPath: this.serviceWorkerPath
    });
  }
}

module.exports = PolymerProject;
