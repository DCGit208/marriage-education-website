#!/usr/bin/ruby
require 'rubygems'
require 'bundler/setup'
require 'rack'
require_relative 'server'

Rack::Handler::CGI.run Sinatra::Application
