FROM php:8.2-fpm
FROM php:8.2-fpm
RUN apt-get update && apt-get install -y \
        libicu-dev vim redis-tools git libxml2-dev wget zip unzip mc htop nano
RUN apt-get update -y && apt-get install -y libwebp-dev libjpeg-dev libjpeg62-turbo-dev libpng-dev libxpm-dev \
    libfreetype6-dev zlib1g-dev libzip-dev libgmp-dev mariadb-client \
    && docker-php-ext-install \
        mysqli pdo pdo_mysql \
    && docker-php-ext-install \
        soap zip
# Big-integer maths for the elliptic-curve signing behind web push. With neither
# extension present, minishlink/web-push raises an E_USER_NOTICE from its
# constructor, Laravel promotes that notice to an ErrorException, and every push
# send aborts before a single notification leaves the server. gmp is the fastest
# backend; bcmath is the fallback the library also accepts.
RUN docker-php-ext-install bcmath gmp
RUN pecl install redis && docker-php-ext-enable redis
RUN docker-php-ext-configure gd --with-jpeg --with-webp
RUN docker-php-ext-install gd
ADD ./conf.d/  /usr/local/etc/php/conf.d/
# Get latest Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer
# Chage permissions
RUN chown -R www-data:www-data /var/www
#WORKDIR .
