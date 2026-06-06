docker build -t alexstapo/flame-revamped -t "alexstapo/flame-revamped:$1" -f .docker/Dockerfile . \
  && docker push alexstapo/flame-revamped && docker push "alexstapo/flame-revamped:$1"
