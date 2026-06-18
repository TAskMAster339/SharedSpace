import React from 'react';
import { useParams } from 'react-router-dom';

const DirectoryPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return <h1>Директория: {id}</h1>;
};

export default DirectoryPage;
