#!/usr/bin/env ruby
# generate_ebook_placeholders.rb
# Creates placeholder PDF files for each product's download_filename in /ebooks

require 'csv'
require 'fileutils'

require 'prawn' # gem install prawn

CSV_PATH = File.expand_path('stripe/products.csv', __dir__)
EBOOKS_DIR = File.expand_path('ebooks', __dir__)

FileUtils.mkdir_p(EBOOKS_DIR)

created = 0
CSV.foreach(CSV_PATH, headers: true) do |row|
  fname = row['download_filename']
  next unless fname && !fname.strip.empty?
  path = File.join(EBOOKS_DIR, fname)
  next if File.exist?(path) # Don't overwrite existing
  Prawn::Document.generate(path) do
    text "Placeholder for #{row['name']}\n\nReplace this file with your real eBook PDF.", align: :center, size: 20
  end
  created += 1
end
puts "Created #{created} placeholder PDFs in #{EBOOKS_DIR}"
