#!/usr/bin/env ruby
# generate_products_csv.rb
# Auto-generates stripe/products.csv from shop.html and images folder

require 'nokogiri'
require 'csv'
require 'fileutils'
require 'cgi'

SHOP_HTML = '../shop.html'
IMAGES_DIR = '../images'
CSV_PATH = './products.csv'

# Helper to create a URL-safe product_id
def product_id_from_name(name)
  name.downcase.gsub(/[^a-z0-9]+/, '-').gsub(/^-|-$/, '')
end


# Helper to assign category
def category_from_name(name)
  return 'bundle' if name =~ /bundle|collection|library/i
  return 'magazine' if name =~ /magazine|issue|archive/i
  return 'training' if name =~ /course|training|q&a|workshop|class/i
  # All books are ebooks
  'ebook'
end

# Helper to assign tags
def tags_from_name(name)
  tags = []
  tags << 'bundle' if name =~ /bundle|collection|library/i
  tags << 'magazine' if name =~ /magazine|issue|archive/i
  tags << 'training' if name =~ /course|training|q&a|workshop|class/i
  tags << 'ebook' if tags.empty? # default
  tags.join(',')
end

# Helper to assign is_featured (simple: bundles and new releases featured)
def is_featured_from_name(name)
  name =~ /bundle|collection|library|special|celebration|starter/i ? 'TRUE' : 'FALSE'
end

# Helper to assign author/instructor (placeholder, can be improved)
def author_from_name(name)
  # Example: assign Dr. Coach for all, or parse if in name
  'Dr. Coach'
end

# Helper to assign long_description (use first <p> + features)
def long_description_from_div(div)
  desc = div.at_css('p')&.text&.strip || ''
  features = div.css('.course-features ul li').map { |li| li.text.strip } rescue []
  desc += "\nFeatures: " + features.join('; ') unless features.empty?
  desc
end

# Helper to assign bundle_contents (list included books for bundles)
def bundle_contents_from_div(div)
  return '' unless div.to_html =~ /bundle|collection|library/i
  # Try to extract list items under "What's Included"
  items = div.css('.course-features ul li').map { |li| li.text.strip } rescue []
  items.select { |i| i =~ /SBD|Art|Marriage|Naked|Canonical|Compendium|Real Couples|Heart|Unequally|Porn|Guide|Book/i }.join('; ')
end

# Parse shop.html
html = File.read(SHOP_HTML)
doc = Nokogiri::HTML(html)


products = []

# Find all product divs
product_divs = doc.css('.product-grid .product, .product')
product_divs.each_with_index do |div, idx|
  # Get name
  name = div.at_css('h4')&.text&.strip
  next unless name && !name.empty?

  # Get price (first $xx.xx in .price)
  price = div.at_css('.price')&.text&.scan(/\$([\d.]+)/)&.flatten&.first
  next unless price

  # Get image filename
  img = div.at_css('img')
  image_filename = img ? File.basename(img['src']) : ''

  # Generate product_id
  product_id = product_id_from_name(name)

  # Category
  category = category_from_name(name)

  # All books are ebooks
  type = 'ebook'

  # Download filename for digital products
  download_filename = "#{product_id}.pdf"

  # Stripe product id (placeholder: can be replaced with real Stripe IDs after sync)
  stripe_product_id = "stripe_prod_#{product_id}"

  # is_featured
  is_featured = is_featured_from_name(name)

  # tags
  tags = tags_from_name(name)

  # long_description
  long_description = long_description_from_div(div)

  # author/instructor
  author = author_from_name(name)

  # bundle_contents
  bundle_contents = bundle_contents_from_div(div)

  products << {
    product_id: product_id,
    name: name,
    price: price,
    image_filename: image_filename,
    type: type,
    download_filename: download_filename,
    stripe_product_id: stripe_product_id,
    category: category,
    is_featured: is_featured,
    tags: tags,
    long_description: long_description,
    author: author,
    bundle_contents: bundle_contents
  }
end

# Write to CSV
CSV.open(CSV_PATH, 'w') do |csv|
  csv << %w[product_id name price image_filename type download_filename stripe_product_id category is_featured tags long_description author bundle_contents]
  products.each do |p|
    csv << [
      p[:product_id],
      p[:name],
      p[:price],
      p[:image_filename],
      p[:type],
      p[:download_filename],
      p[:stripe_product_id],
      p[:category],
      p[:is_featured],
      p[:tags],
      p[:long_description],
      p[:author],
      p[:bundle_contents]
    ]
  end
end

puts "Wrote #{products.size} products to #{CSV_PATH} with extended fields."
